const http = require('http')
http.createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    console.log(body)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"id":"ok"}')
  })
}).listen(8799)
