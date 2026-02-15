function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Check if the URI is missing a file extension and doesn't end with a slash
    if (!uri.includes('.') && !uri.endsWith('/')) {
        // Add trailing slash
        request.uri = uri + '/';
    }
    
    // Check if URI ends with a slash
    if (uri.endsWith('/')) {
        // Append index.html
        request.uri = uri + 'index.html';
    }
    
    return request;
}
