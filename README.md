# PolizaLab MVP

PolizaLab es un asistente diario mobile-first para agentes de seguros principiantes en México. El sistema permite subir pólizas en múltiples formatos, extraer datos automáticamente usando AWS Textract, y gestionar renovaciones próximas.

## Tech Stack

- **Frontend**: React 18 + Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: AWS Lambda (Node.js 18), API Gateway, DynamoDB, S3, Textract, Cognito
- **Testing**: Jest, React Testing Library, fast-check (property-based testing)

## Project Structure

```
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/              # Utility functions and helpers
├── types/            # TypeScript type definitions
├── .kiro/specs/      # Project specifications and design docs
└── public/           # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- AWS Account with configured services (see AWS Setup Guide)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env.local` and fill in your AWS credentials:

```bash
cp .env.example .env.local
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## AWS Setup

Refer to `.kiro/specs/polizalab-mvp/tasks.md` Task 2 for detailed AWS infrastructure setup instructions.

## Testing

The project uses a dual testing approach:

- **Unit Tests**: Specific examples and edge cases
- **Property-Based Tests**: Universal properties across all inputs (100+ iterations)

Run tests with:

```bash
npm test
```

## Documentation

- [Requirements](.kiro/specs/polizalab-mvp/requirements.md)
- [Design Document](.kiro/specs/polizalab-mvp/design.md)
- [Implementation Tasks](.kiro/specs/polizalab-mvp/tasks.md)

## License

Private - All rights reserved
