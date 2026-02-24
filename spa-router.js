function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Pass through /_next/ static assets unchanged
  if (uri.startsWith('/_next/')) {
    return request;
  }

  // Pass through files with extensions (js, css, ico, txt, png, etc.)
  if (/\.[a-zA-Z0-9]+$/.test(uri)) {
    return request;
  }

  // Rewrite /policies/{dynamic-id}[/] to the pre-generated shell page
  var knownPolicySegments = ['nueva', '_'];
  var policyMatch = /^\/policies\/([^\/]+)\/?$/.exec(uri);
  if (policyMatch) {
    var segment = policyMatch[1];
    if (knownPolicySegments.indexOf(segment) === -1) {
      request.uri = '/policies/_/index.html';
      return request;
    }
  }

  // Append index.html to all other directory-style paths
  // (handles hard navigation to /login, /policies, /account/*, etc.)
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else {
    request.uri = uri + '/index.html';
  }

  return request;
}
