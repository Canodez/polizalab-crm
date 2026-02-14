import { DynamoDBClient, QueryCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const POLICIES_TABLE = process.env.DYNAMODB_POLICIES_TABLE || 'Policies';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'polizalab-documents-dev';

interface APIGatewayEvent {
  httpMethod: string;
  path: string;
  pathParameters?: { id?: string };
  headers: { [key: string]: string };
  body?: string;
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: {
          sub?: string;
        };
      };
    };
  };
}

interface Policy {
  policyId: string;
  userId: string;
  clienteNombre?: string | null;
  clienteApellido?: string | null;
  edad?: number | null;
  tipoPoliza?: string | null;
  cobertura?: string | null;
  numeroPoliza?: string | null;
  aseguradora?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  fechaRenovacion?: string | null;
  renewalStatus?: string;
  s3Key: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Extract userId from JWT token
function extractUserId(event: APIGatewayEvent): string | null {
  // Try Cognito authorizer context first
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (sub) return sub;

  // Fallback to Authorization header
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) return null;

  try {
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub || null;
  } catch {
    return null;
  }
}

// Calculate renewal date (12 months for most types, null for Vida permanente)
function calculateRenewalDate(tipoPoliza: string | null | undefined, fechaInicio: string | null | undefined): string | null {
  if (!tipoPoliza || !fechaInicio) return null;

  if (tipoPoliza === 'Vida permanente') return null;

  const startDate = new Date(fechaInicio);
  if (isNaN(startDate.getTime())) return null;

  // Add 12 months
  const renewalDate = new Date(startDate);
  renewalDate.setMonth(renewalDate.getMonth() + 12);

  return renewalDate.toISOString().split('T')[0];
}

// Calculate renewal status based on days until renewal
function calculateRenewalStatus(fechaRenovacion: string | null | undefined): string {
  if (!fechaRenovacion) return 'NOT_URGENT';

  const renewalDate = new Date(fechaRenovacion);
  if (isNaN(renewalDate.getTime())) return 'NOT_URGENT';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  renewalDate.setHours(0, 0, 0, 0);

  const daysUntilRenewal = Math.floor((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilRenewal < 0) return 'OVERDUE';
  if (daysUntilRenewal <= 30) return '30_DAYS';
  if (daysUntilRenewal <= 60) return '60_DAYS';
  if (daysUntilRenewal <= 90) return '90_DAYS';
  return 'NOT_URGENT';
}

// GET /policies - List user's policies
async function listPolicies(userId: string): Promise<any> {
  const command = new QueryCommand({
    TableName: POLICIES_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: marshall({ ':userId': userId }),
    ScanIndexForward: false, // Sort by createdAt DESC
    Limit: 10,
  });

  const result = await dynamoClient.send(command);
  const policies = result.Items?.map(item => unmarshall(item)) || [];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ policies }),
  };
}

// GET /policies/:id - Get single policy
async function getPolicy(userId: string, policyId: string): Promise<any> {
  const command = new GetItemCommand({
    TableName: POLICIES_TABLE,
    Key: marshall({ policyId }),
  });

  const result = await dynamoClient.send(command);

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Policy not found' }),
    };
  }

  const policy = unmarshall(result.Item) as Policy;

  // Authorization check
  if (policy.userId !== userId) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }

  // Recalculate renewal status
  policy.renewalStatus = calculateRenewalStatus(policy.fechaRenovacion);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(policy),
  };
}

// PUT /policies/:id - Update policy
async function updatePolicy(userId: string, policyId: string, updates: any): Promise<any> {
  // First, get the policy to verify ownership
  const getCommand = new GetItemCommand({
    TableName: POLICIES_TABLE,
    Key: marshall({ policyId }),
  });

  const getResult = await dynamoClient.send(getCommand);

  if (!getResult.Item) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Policy not found' }),
    };
  }

  const policy = unmarshall(getResult.Item) as Policy;

  // Authorization check
  if (policy.userId !== userId) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }

  // Recalculate fechaRenovacion if fechaInicio or tipoPoliza changed
  if (updates.fechaInicio || updates.tipoPoliza) {
    const newFechaInicio = updates.fechaInicio || policy.fechaInicio;
    const newTipoPoliza = updates.tipoPoliza || policy.tipoPoliza;
    updates.fechaRenovacion = calculateRenewalDate(newTipoPoliza, newFechaInicio);
  }

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: { [key: string]: string } = {};
  const expressionAttributeValues: { [key: string]: any } = {};

  const allowedFields = [
    'clienteNombre',
    'clienteApellido',
    'edad',
    'tipoPoliza',
    'cobertura',
    'numeroPoliza',
    'aseguradora',
    'fechaInicio',
    'fechaFin',
    'fechaRenovacion',
  ];

  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = updates[field];
    }
  });

  // Always update updatedAt
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  const updateCommand = new UpdateItemCommand({
    TableName: POLICIES_TABLE,
    Key: marshall({ policyId }),
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: marshall(expressionAttributeValues),
    ReturnValues: 'ALL_NEW',
  });

  const updateResult = await dynamoClient.send(updateCommand);
  const updatedPolicy = unmarshall(updateResult.Attributes!);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ success: true, policy: updatedPolicy }),
  };
}

// GET /policies/renewals - Get upcoming renewals
async function getUpcomingRenewals(userId: string): Promise<any> {
  const command = new QueryCommand({
    TableName: POLICIES_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: marshall({ ':userId': userId }),
  });

  const result = await dynamoClient.send(command);
  const policies = result.Items?.map(item => unmarshall(item) as Policy) || [];

  // Recalculate renewal status for each policy
  policies.forEach(policy => {
    policy.renewalStatus = calculateRenewalStatus(policy.fechaRenovacion);
  });

  // Filter for urgent renewals
  const urgentPolicies = policies.filter(p =>
    ['30_DAYS', '60_DAYS', '90_DAYS'].includes(p.renewalStatus || '')
  );

  // Sort by fechaRenovacion ascending
  urgentPolicies.sort((a, b) => {
    if (!a.fechaRenovacion) return 1;
    if (!b.fechaRenovacion) return -1;
    return a.fechaRenovacion.localeCompare(b.fechaRenovacion);
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ renewals: urgentPolicies }),
  };
}

// POST /policies/upload-url - Generate pre-signed URL for document upload
async function getDocumentUploadUrl(userId: string, body: any): Promise<any> {
  const { fileName, fileType } = body;

  if (!fileName || !fileType) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'fileName and fileType are required' }),
    };
  }

  const s3Key = `policies/${userId}/${uuidv4()}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    ContentType: fileType,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ presignedUrl, s3Key }),
  };
}

// Main Lambda handler
export async function handler(event: APIGatewayEvent): Promise<any> {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const userId = extractUserId(event);

    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const method = event.httpMethod;
    const path = event.path;

    // Route requests
    if (method === 'GET' && path === '/policies') {
      return await listPolicies(userId);
    }

    if (method === 'GET' && path === '/policies/renewals') {
      return await getUpcomingRenewals(userId);
    }

    if (method === 'GET' && path.startsWith('/policies/') && event.pathParameters?.id) {
      return await getPolicy(userId, event.pathParameters.id);
    }

    if (method === 'PUT' && path.startsWith('/policies/') && event.pathParameters?.id) {
      const body = JSON.parse(event.body || '{}');
      return await updatePolicy(userId, event.pathParameters.id, body);
    }

    if (method === 'POST' && path === '/policies/upload-url') {
      const body = JSON.parse(event.body || '{}');
      return await getDocumentUploadUrl(userId, body);
    }

    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error: any) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
}
