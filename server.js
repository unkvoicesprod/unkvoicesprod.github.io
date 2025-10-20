const http = require("http");
const fs = require("fs");
const path = require("path");
const mime = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
};
const server = http.createServer((req, res) => {
    let filePath = path.join(
        __dirname,
        req.url === "/" ? "index.html" : req.url,
    );
    let ext = path.extname(filePath);
    let contentType = mime[ext] || "application/octet-stream";
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(err.code === "ENOENT" ? 404 : 500, {
                "Content-Type": "text/plain",
            });
            res.end(
                err.code === "ENOENT" ? "Arquivo não encontrado" : "Erro interno",
            );
        } else {
            res.writeHead(200, { "Content-Type": contentType });
            res.end(content);
        }
    });
});
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});