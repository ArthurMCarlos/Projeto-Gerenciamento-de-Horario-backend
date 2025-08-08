const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Conexão MongoDB
let db;
MongoClient.connect(process.env.MONGODB_URI)
  .then(client => {
    console.log('Conectado ao MongoDB');
    db = client.db('meuBanco'); // Nome do seu banco
  })
  .catch(error => console.error(error));

// Rotas da API
app.get('/api/dados', async (req, res) => {
  try {
    const dados = await db.collection('minhaColecao').find({}).toArray();
    res.json(dados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dados', async (req, res) => {
  try {
    const resultado = await db.collection('minhaColecao').insertOne(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir arquivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});