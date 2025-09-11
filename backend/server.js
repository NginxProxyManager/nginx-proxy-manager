const express = require("express");
const app = express();

const PORT = process.env.PORT || 5000;
cd 
// Middleware
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.send("Hello World");
})

app.get('/login', (req, res) => {
    res.render('../login')
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})