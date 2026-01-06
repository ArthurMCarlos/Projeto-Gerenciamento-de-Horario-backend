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
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// Configurações de conexão com MongoDB
const mongoOptions = {
    maxPoolSize: 10,                    // Número máximo de conexões no pool
    minPoolSize: 2,                     // Número mínimo de conexões mantidas
    serverSelectionTimeoutMS: 5000,     // Tempo para seleção de servidor
    socketTimeoutMS: 45000,             // Timeout de operações de socket
    connectTimeoutMS: 10000,            // Timeout de conexão inicial
    retryWrites: true,                  // Tentar novamente escritas que falharam
    retryReads: true                    // Tentar novamente leituras que falharam
};

let db;
let client;

// Função para conectar ao MongoDB com reconexão automática
async function connectDB() {
    try {
        console.log('Tentando conectar ao MongoDB...');
        client = new MongoClient(process.env.MONGODB_URI, mongoOptions);
        
        await client.connect();
        
        db = client.db('Project0');
        
        console.log('✅ Conectado ao MongoDB Atlas com sucesso');
        
        // Configura eventos de conexão
        client.on('close', () => {
            console.warn('Conexão MongoDB fechada. Tentando reconectar...');
            db = null;
            // Tenta reconectar automaticamente após 5 segundos
            setTimeout(connectDB, 5000);
        });
        
    } catch (error) {
        console.error('❌ Erro ao conectar ao MongoDB:', error.message);
        console.log('Tentando reconectar em 5 segundos...');
        // Tenta reconectar após 5 segundos
        setTimeout(connectDB, 5000);
    }
}

// Inicia a conexão com o banco de dados
connectDB();

app.get('/api/work-days', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Banco não conectado' });
    }
    
    const workDays = await db.collection('workDays').find({}).toArray();
    res.json(workDays);
  } catch (error) {
    console.error('Erro ao buscar dias:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/work-days', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Banco não conectado' });
    }

    await db.collection('workDays').deleteMany({});
    
    if (req.body.length > 0) {
      const result = await db.collection('workDays').insertMany(req.body);
      res.json({ success: true, insertedCount: result.insertedCount });
    } else {
      res.json({ success: true, message: 'Dados limpos' });
    }
  } catch (error) {
    console.error('Erro ao salvar dias:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Banco não conectado' });
    }

    await db.collection('settings').replaceOne(
      { type: 'user_settings' },
      { type: 'user_settings', ...req.body },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Banco não conectado' });
    }

    const settings = await db.collection('settings').findOne({ type: 'user_settings' });
    res.json(settings || {});
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota de heartbeat para manter conexão ativa
app.get('/api/ping', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    dbConnected: !!db
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API funcionando!', 
    dbConnected: !!db,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Erro no servidor:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL: ${PORT === 3000 ? 'http://localhost:3000' : 'https://seu-app.onrender.com'}`);
});
