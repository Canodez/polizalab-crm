/**
 * CloudFront Function for URI Rewriting
 * 
 * This function rewrites URIs to resolve static routes to index.html files.
 * It handles three cases:
 * 1. URI ends with "/" → append "index.html"
 * 2. URI has no extension → append "/index.html"
 * 3. URI has extension → no modification
 * 
 * Requirements: 1.1, 1.2, 1.4, 5.2, 5.3, 5.4
 */

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  
  // Case 1: URI ends with "/" → append "index.html"
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }
  
  // Case 2: URI has no extension → append "/index.html"
  if (!uri.includes('.')) {
    request.uri = uri + '/index.html';
    return request;
  }
  
  // Case 3: URI has extension → no modification
  return request;
}
