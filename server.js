// Servidor Socket.io para el juego de casino

const { getGameHistory, getPlayerStats, registerGame, db, registerDadosGame } = require('./firebase-config');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Estructura para almacenar información de salas de juego
const gameRooms = {};
const dadosGameRooms = {};

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- Cache en memoria para datos de Firebase (pre-carga) ---
let cachedGameHistory = [];
let cachedPlayerStats = [];
const CACHE_REFRESH_MS = parseInt(process.env.CACHE_REFRESH_MS) || 60 * 1000; // 60s por defecto

async function refreshFirebaseCache(limit = 50) {
  try {
    console.log('[cache] Refrescando cache de Firebase...');
    const games = await getGameHistory(limit);
    const players = await getPlayerStats();
    cachedGameHistory = games || [];
    cachedPlayerStats = players || [];
    console.log(`[cache] Cache actualizada: ${cachedGameHistory.length} partidas, ${cachedPlayerStats.length} jugadores`);
    return true;
  } catch (err) {
    console.error('[cache] Error refrescando cache de Firebase:', err);
    return false;
  }
}

// Pre-cargar cache al arrancar
refreshFirebaseCache().then(ok => {
  if (!ok) console.warn('[cache] Pre-carga fallida, los endpoints usarán llamadas directas si es necesario');
});

// Refrescar periódicamente
setInterval(() => {
  refreshFirebaseCache().catch(err => console.error('[cache] Falló refresh periódico:', err));
}, CACHE_REFRESH_MS);


// Valores posibles de los dados (consistente con cliente)
const valores = ['A', 'K', 'Q', 'J', 'R', 'N'];

// Función para mostrar detalles de la solicitud
function logRequestDetails(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}

// Añadir middleware para logging de peticiones
app.use(logRequestDetails);

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para obtener historial de partidas
app.get('/api/games/history', async (req, res) => {
  try {
    console.log('Solicitando historial de partidas vía HTTP');
    const limit = req.query.limit || 20;
    // Devolver desde cache si existe
    if (cachedGameHistory && cachedGameHistory.length > 0) {
      return res.json(cachedGameHistory.slice(0, parseInt(limit)));
    }

    // Fallback: consulta directa
    const gameHistory = await getGameHistory(parseInt(limit));
    res.json(gameHistory);
  } catch (error) {
    console.error('Error al obtener historial de partidas:', error);
    res.status(500).json({ error: 'Error al obtener historial de partidas' });
  }
});

// Ruta para obtener estadísticas de jugadores
app.get('/api/players/stats', async (req, res) => {
  try {
    console.log('Solicitando estadísticas de jugadores vía HTTP');
    if (cachedPlayerStats && cachedPlayerStats.length > 0) {
      return res.json(cachedPlayerStats);
    }

    const playerStats = await getPlayerStats();
    res.json(playerStats);
  } catch (error) {
    console.error('Error al obtener estadísticas de jugadores:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de jugadores' });
  }
});

// Endpoint para forzar refresco de cache (opcionalmente protegido por secret)
app.post('/api/refresh-cache', async (req, res) => {
  try {
    const secret = process.env.REFRESH_SECRET || '';
    if (secret && req.query.secret !== secret) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const ok = await refreshFirebaseCache();
    if (ok) return res.json({ ok: true });
    return res.status(500).json({ ok: false, message: 'Refresh failed' });
  } catch (err) {
    console.error('Error forcing cache refresh:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/check-database', async (req, res) => {
  try {
    console.log('Verificando conexión a Firebase...');
    
    if (!db) {
      return res.status(500).json({ 
        connected: false, 
        message: 'Instancia de base de datos no inicializada' 
      });
    }
    
    // Intentar una operación simple de lectura
    const ref = db.ref('.info/connected');
    const snapshot = await ref.once('value');
    const connected = snapshot.val() === true;
    
    if (connected) {
      console.log('✅ Conexión a Firebase establecida correctamente');
      return res.json({ 
        connected: true, 
        message: 'Conexión a Firebase establecida correctamente' 
      });
    } else {
      console.log('❌ No se pudo conectar a Firebase');
      return res.status(503).json({ 
        connected: false, 
        message: 'No se pudo conectar a Firebase' 
      });
    }
  } catch (error) {
    console.error('❌ Error al verificar conexión a Firebase:', error);
    return res.status(500).json({ 
      connected: false, 
      error: error.message,
      message: 'Error al verificar conexión a Firebase' 
    });
  }
});

// También puedes añadir un endpoint para comprobar específicamente que funciona la recuperación de datos
app.get('/api/check-data-retrieval', async (req, res) => {
  try {
    console.log('Probando recuperación de datos...');
    
    // Intentar obtener datos reales
    const start = Date.now();
    const games = await getGameHistory(1);
    const players = await getPlayerStats();
    const end = Date.now();
    
    return res.json({
      success: true,
      message: 'Recuperación de datos correcta',
      timing: {
        total: `${end - start}ms`,
      },
      stats: {
        gamesRetrieved: games.length,
        playersRetrieved: players.length
      }
    });
  } catch (error) {
    console.error('❌ Error al probar recuperación de datos:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error al recuperar datos de Firebase'
    });
  }
});

// Manejo de conexiones de Socket.io
io.on('connection', (socket) => {
  console.log(`Nuevo jugador conectado: ${socket.id}`);

  // Evento para crear una nueva sala
  socket.on('createRoom', (data) => {
    const roomId = generateRoomId();
    const playerName = data.playerName || `Jugador ${socket.id.substr(0, 4)}`;
    
    // Crear nueva sala
    gameRooms[roomId] = {
      id: roomId,
      creator: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        scores: [],
        currentRoundScore: 0,
        totalScore: 0
      }],
      currentTurn: 0,
      round: 1,
      gameStarted: false,
      maxPlayers: data.maxPlayers || 8
    };

    // Unir al creador a la sala
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerIndex = 0;

    // Notificar al creador
    socket.emit('roomCreated', {
      roomId: roomId,
      player: gameRooms[roomId].players[0],
      isCreator: true
    });

    console.log(`Sala creada: ${roomId} por jugador ${playerName}`);
  });

  // Evento para unirse a una sala existente
  socket.on('joinRoom', (data) => {
    const roomId = data.roomId;
    const playerName = data.playerName || `Jugador ${socket.id.substr(0, 4)}`;

    // Verificar si la sala existe
    if (!gameRooms[roomId]) {
      socket.emit('error', { message: 'La sala no existe' });
      return;
    }

    // Verificar si el juego ya comenzó
    if (gameRooms[roomId].gameStarted) {
      socket.emit('error', { message: 'El juego ya ha comenzado' });
      return;
    }

    // Verificar si la sala está llena
    if (gameRooms[roomId].players.length >= gameRooms[roomId].maxPlayers) {
      socket.emit('error', { message: 'La sala está llena' });
      return;
    }

    // Añadir jugador a la sala
    const playerIndex = gameRooms[roomId].players.length;
    gameRooms[roomId].players.push({
      id: socket.id,
      name: playerName,
      scores: [],
      currentRoundScore: 0,
      totalScore: 0
    });

    // Unir al jugador a la sala
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerIndex = playerIndex;

    // Notificar al jugador
    socket.emit('roomJoined', {
      roomId: roomId,
      player: gameRooms[roomId].players[playerIndex],
      isCreator: false,
      players: gameRooms[roomId].players,
      creatorId: gameRooms[roomId].creator
    });

    // Notificar a todos los jugadores en la sala
    io.to(roomId).emit('playerJoined', {
      player: gameRooms[roomId].players[playerIndex],
      players: gameRooms[roomId].players
    });

    console.log(`Jugador ${playerName} se unió a la sala ${roomId}`);
  });

  // Evento para iniciar el juego
  socket.on('startGame', () => {
    const roomId = socket.roomId;
    
    if (!roomId || !gameRooms[roomId]) {
      socket.emit('error', { message: 'No estás en una sala válida' });
      return;
    }

    // Verificar si el jugador es el creador
    if (socket.id !== gameRooms[roomId].creator) {
      socket.emit('error', { message: 'Solo el creador puede iniciar el juego' });
      return;
    }

    // Iniciar juego
    gameRooms[roomId].gameStarted = true;
    gameRooms[roomId].currentTurn = 0; // El primer jugador comienza
    
    // Notificar a todos los jugadores que el juego ha comenzado
    io.to(roomId).emit('gameStarted', {
      currentPlayer: gameRooms[roomId].players[0],
      players: gameRooms[roomId].players,
      round: gameRooms[roomId].round
    });

    console.log(`Juego iniciado en sala ${roomId}`);
  });

  // Evento para incrementar puntuación
  socket.on('increaseScore', () => {
    const roomId = socket.roomId;
    const playerIndex = socket.playerIndex;
    
    if (!roomId || !gameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala válida' });
      return;
    }

    // Verificar si es el turno del jugador
    if (gameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno' });
      return;
    }

    // Incrementar puntuación temporal
    gameRooms[roomId].players[playerIndex].currentRoundScore += 50;
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('scoreUpdated', {
      playerIndex: playerIndex,
      currentRoundScore: gameRooms[roomId].players[playerIndex].currentRoundScore,
      players: gameRooms[roomId].players
    });
  });

  // Evento para decrementar puntuación
  socket.on('decreaseScore', () => {
    const roomId = socket.roomId;
    const playerIndex = socket.playerIndex;
    
    if (!roomId || !gameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala válida' });
      return;
    }

    // Verificar si es el turno del jugador
    if (gameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno' });
      return;
    }

    // Decrementar puntuación temporal
    gameRooms[roomId].players[playerIndex].currentRoundScore -= 50;
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('scoreUpdated', {
      playerIndex: playerIndex,
      currentRoundScore: gameRooms[roomId].players[playerIndex].currentRoundScore,
      players: gameRooms[roomId].players
    });
  });

  // Evento para bancarrota
  socket.on('bankrupt', () => {
    const roomId = socket.roomId;
    const playerIndex = socket.playerIndex;
    
    if (!roomId || !gameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala válida' });
      return;
    }

    // Verificar si es el turno del jugador
    if (gameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno' });
      return;
    }

    // Reiniciar puntuaciones del jugador
    gameRooms[roomId].players[playerIndex].scores = [];
    gameRooms[roomId].players[playerIndex].currentRoundScore = 0;
    gameRooms[roomId].players[playerIndex].totalScore = 0;
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('playerBankrupt', {
      playerIndex: playerIndex,
      players: gameRooms[roomId].players
    });

    // Avanzar turno
    nextTurn(roomId);
  });

  // Evento para finalizar turno
  socket.on('finishTurn', () => {
    const roomId = socket.roomId;
    const playerIndex = socket.playerIndex;
    
    if (!roomId || !gameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala válida' });
      return;
    }

    // Verificar si es el turno del jugador
    if (gameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno' });
      return;
    }

    const player = gameRooms[roomId].players[playerIndex];
    
    // Guardar puntuación de la ronda
    player.scores.push(player.currentRoundScore);
    player.totalScore = player.scores.reduce((a, b) => a + b, 0);
    player.currentRoundScore = 0;
    
    // Avanzar turno
    gameRooms[roomId].currentTurn = (gameRooms[roomId].currentTurn + 1) % gameRooms[roomId].players.length;
    
    // Si hemos completado una ronda (el turno vuelve al primer jugador)
    if (gameRooms[roomId].currentTurn === 0) {
      // Comprobar victoria al final de la ronda
      const winnerResult = checkVictoryCondition(roomId);
      
      // Solo avanzar a la siguiente ronda si no hubo ganador
      if (!winnerResult) {
        gameRooms[roomId].round++;
        
        // Notificar a todos los jugadores el cambio de turno
        io.to(roomId).emit('turnChanged', {
          currentPlayerIndex: gameRooms[roomId].currentTurn,
          currentPlayer: gameRooms[roomId].players[gameRooms[roomId].currentTurn],
          round: gameRooms[roomId].round,
          players: gameRooms[roomId].players
        });
      }
    } else {
      // Notificar a todos los jugadores el cambio de turno
      io.to(roomId).emit('turnChanged', {
        currentPlayerIndex: gameRooms[roomId].currentTurn,
        currentPlayer: gameRooms[roomId].players[gameRooms[roomId].currentTurn],
        round: gameRooms[roomId].round,
        players: gameRooms[roomId].players
      });
    }
  });

  // Evento para obtener historial de partidas
  socket.on('getGameHistory', async () => {
    try {
      console.log(`Solicitando historial de partidas para ${socket.id}`);
      // Enviar desde cache si está disponible
      if (cachedGameHistory && cachedGameHistory.length > 0) {
        socket.emit('gameHistoryData', cachedGameHistory.slice(0, 20));
      } else {
        const gameHistory = await getGameHistory(20); // Obtener últimas 20 partidas
        socket.emit('gameHistoryData', gameHistory);
      }
    } catch (error) {
      console.error('Error al obtener historial de partidas:', error);
      socket.emit('gameHistoryData', []);
    }
  });

  // Evento para obtener estadísticas de jugadores
  socket.on('getPlayerStats', async () => {
    try {
      console.log(`Solicitando estadísticas de jugadores para ${socket.id}`);
      if (cachedPlayerStats && cachedPlayerStats.length > 0) {
        socket.emit('playerStatsData', cachedPlayerStats);
      } else {
        const playerStats = await getPlayerStats();
        socket.emit('playerStatsData', playerStats);
      }
    } catch (error) {
      console.error('Error al obtener estadísticas de jugadores:', error);
      socket.emit('playerStatsData', []);
    }
  });

  // Evento para abandonar sala/desconexión
  socket.on('disconnect', () => {
    handlePlayerDisconnect(socket);
    handleDadosPlayerDisconnect(socket);
  });

  socket.on('leaveRoom', () => {
    handlePlayerDisconnect(socket);
    socket.emit('leftRoom');
  });

  // Eventos para el modo dados
  // Nuevo endpoint: cliente solicita que el servidor genere una tirada (RNG server-side)
  socket.on('requestDadosRoll', (req) => {
    try {
      const roomId = socket.dadosRoomId;
      if (!roomId || !dadosGameRooms[roomId]) {
        socket.emit('error', { message: 'No estás en una sala de dados válida' });
        return;
      }

      // Verificar si es el turno del jugador
      const playerIndex = socket.dadosPlayerIndex;
      if (dadosGameRooms[roomId].currentTurn !== playerIndex) {
        socket.emit('error', { message: 'No es tu turno' });
        return;
      }

      // Determinar qué dados están disponibles (no bloqueados)
      if (!dadosGameRooms[roomId].dadosState) {
        dadosGameRooms[roomId].dadosState = {
          valoresDados: ['-', '-', '-', '-'],
          dadosBloqueados: [false, false, false, false],
          total: 0
        };
      }

      const available = [];
      for (let i = 0; i < 4; i++) {
        if (!dadosGameRooms[roomId].dadosState.dadosBloqueados[i]) available.push(i);
      }

      if (available.length === 0) {
        // Nada que tirar, indicar reinicio
        socket.emit('error', { message: 'No hay dados disponibles para tirar' });
        return;
      }

      // Generar secuencias y valores finales server-side para evitar discrepancias y cheating
      const secuencias = [];
      const valoresFinales = [];
      const dadosAnimados = [];

      for (const dadoId of available) {
        const secuencia = [];
        for (let j = 0; j < 12; j++) {
          const idx = Math.floor(Math.random() * valores.length);
          secuencia.push(valores[idx]);
        }

        const finalIdx = Math.floor(Math.random() * valores.length);
        const valorFinal = valores[finalIdx];

        secuencias.push({ dadoId, secuencia });
        valoresFinales.push({ dadoId, valor: valorFinal });
        dadosAnimados.push(dadoId);
      }

      const data = {
        playerName: dadosGameRooms[roomId].players[playerIndex].name,
        playerIndex,
        secuencias,
        valoresFinales,
        dadosAnimados
      };

      // Guardar tirada en la sala (por si se necesita)
      dadosGameRooms[roomId].tiradaActual = data;

      // Iniciar la animación en todos los clientes
      io.to(roomId).emit('iniciarTiradaAnimacion', data);

      // Después de la animación, enviar valores finales y evaluar
      setTimeout(() => {
        // Actualizar valores de dados en la sala (solo los tirados)
        data.valoresFinales.forEach(item => {
          dadosGameRooms[roomId].dadosState.valoresDados[item.dadoId] = item.valor;
        });

        io.to(roomId).emit('finalizarTiradaAnimacion', { valoresFinales: data.valoresFinales });

        // Programar evaluación
        setTimeout(() => {
          const dadosTirados = data.valoresFinales.map(item => ({ index: item.dadoId, valor: item.valor }));
          evaluarTirada(roomId, dadosTirados);
        }, 500);
      }, secuencias[0]?.secuencia.length * 50 + 100 || 700);
    } catch (error) {
      console.error('Error handling requestDadosRoll:', error);
      socket.emit('error', { message: 'Error generando tirada' });
    }
  });

  socket.on('updateDadosGame', async (data) => {
    try {
      // Solo registrar actualización (sin guardar en Firebase todavía)
      console.log(`Actualización de partida de dados por ${socket.id}`);
      
      // Difundir a otros jugadores si hay roomId
      if (socket.roomId) {
        socket.to(socket.roomId).emit('dadosGameUpdated', data);
      }
    } catch (error) {
      console.error('Error en actualización de partida de dados:', error);
    }
  });

  // Evento para finalización de partida en modo dados
  socket.on('finishDadosGame', async (data) => {
    try {
      console.log('Finalizando partida de dados');
      
      // Añadir tipo de modo a los datos para diferenciar en estadísticas
      data.gameMode = 'dados';
      
      // Guardar partida en Firebase usando la función específica para dados
      const gameId = await registerDadosGame(data);
      
      // Notificar a los jugadores
      if (socket.roomId) {
        io.to(socket.roomId).emit('dadosGameFinished', {
          gameId,
          winner: data.winner
        });
      } else {
        socket.emit('dadosGameFinished', {
          gameId,
          winner: data.winner
        });
      }
      
      console.log(`Partida de dados guardada con ID: ${gameId}`);
    } catch (error) {
      console.error('Error al finalizar partida de dados:', error);
      socket.emit('error', { message: 'Error al guardar la partida' });
    }
  });

  socket.on('createDadosRoom', (data) => {
    const roomId = generateRoomId();
    const playerName = data.playerName || `Jugador ${socket.id.substr(0, 4)}`;
    
    // Crear nueva sala de dados
    dadosGameRooms[roomId] = {
      id: roomId,
      creator: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        scores: [],
        currentRoundScore: 0,
        totalScore: 0
      }],
      currentTurn: 0,
      round: 1,
      gameStarted: false,
      maxPlayers: data.maxPlayers || 8
    };

    // Unir al creador a la sala
    socket.join(roomId);
    socket.dadosRoomId = roomId;
    socket.dadosPlayerIndex = 0;

    // Notificar al creador
    socket.emit('dadosRoomCreated', {
      roomId: roomId,
      player: dadosGameRooms[roomId].players[0],
      isCreator: true
    });

    console.log(`Sala de dados creada: ${roomId} por jugador ${playerName}`);
  });

  // Evento para unirse a una sala existente de dados
  socket.on('joinDadosRoom', (data) => {
    const roomId = data.roomId;
    const playerName = data.playerName || `Jugador ${socket.id.substr(0, 4)}`;

    // Verificar si la sala existe
    if (!dadosGameRooms[roomId]) {
      socket.emit('error', { message: 'La sala de dados no existe' });
      return;
    }

    // Verificar si el juego ya comenzó
    if (dadosGameRooms[roomId].gameStarted) {
      socket.emit('error', { message: 'El juego de dados ya ha comenzado' });
      return;
    }

    // Verificar si la sala está llena
    if (dadosGameRooms[roomId].players.length >= dadosGameRooms[roomId].maxPlayers) {
      socket.emit('error', { message: 'La sala de dados está llena' });
      return;
    }

    // Añadir jugador a la sala
    const playerIndex = dadosGameRooms[roomId].players.length;
    dadosGameRooms[roomId].players.push({
      id: socket.id,
      name: playerName,
      scores: [],
      currentRoundScore: 0,
      totalScore: 0
    });

    // Unir al jugador a la sala
    socket.join(roomId);
    socket.dadosRoomId = roomId;
    socket.dadosPlayerIndex = playerIndex;

    // Notificar al jugador
    socket.emit('dadosRoomJoined', {
      roomId: roomId,
      player: dadosGameRooms[roomId].players[playerIndex],
      isCreator: false,
      players: dadosGameRooms[roomId].players,
      creatorId: dadosGameRooms[roomId].creator
    });

    // Notificar a todos los jugadores en la sala
    io.to(roomId).emit('dadosPlayerJoined', {
      player: dadosGameRooms[roomId].players[playerIndex],
      players: dadosGameRooms[roomId].players
    });

    console.log(`Jugador ${playerName} se unió a la sala de dados ${roomId}`);
  });

  // Evento para actualizar la puntuación en el juego de dados
  socket.on('updateDadosScore', (data) => {
    const roomId = socket.dadosRoomId;
    const playerIndex = socket.dadosPlayerIndex;
    
    if (!roomId || !dadosGameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala de dados válida' });
      return;
    }

    // Verificar si es el turno del jugador
    if (dadosGameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno en el juego de dados' });
      return;
    }

    // Si se indica resetear la puntuación total (bancarrota completa)
    if (data.resetTotal) {
      dadosGameRooms[roomId].players[playerIndex].scores = [];
      dadosGameRooms[roomId].players[playerIndex].totalScore = 0;
    }
    
    // Actualizar puntuación temporal
    dadosGameRooms[roomId].players[playerIndex].currentRoundScore = data.score;
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('dadosScoreUpdated', {
      playerIndex: playerIndex,
      currentRoundScore: dadosGameRooms[roomId].players[playerIndex].currentRoundScore,
      players: dadosGameRooms[roomId].players,
      resetTotal: data.resetTotal || false
    });
  });

  socket.on('dadosFinishTurn', () => {
    const roomId = socket.dadosRoomId;
    const playerIndex = socket.dadosPlayerIndex;
    
    if (!roomId || !dadosGameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala de dados válida' });
      return;
    }
  
    // Verificar si es el turno del jugador
    if (dadosGameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno en el juego de dados' });
      return;
    }
  
    const player = dadosGameRooms[roomId].players[playerIndex];
    const currentTotal = dadosGameRooms[roomId].dadosState?.total || 0;
    
    // Guardar puntuación de la ronda (usar el total del estado de la sala)
    if (currentTotal > 0) {
      player.scores.push(currentTotal);
      player.totalScore = player.scores.reduce((a, b) => a + b, 0);
    }
    
    // Resetear puntuación temporal
    player.currentRoundScore = 0;
    
    // Notificar a todos los jugadores sobre la actualización
    io.to(roomId).emit('dadosScoreUpdated', {
      playerIndex: playerIndex,
      currentRoundScore: player.currentRoundScore,
      players: dadosGameRooms[roomId].players,
      resetTotal: false
    });
    
    console.log(`[Sala ${roomId}] Jugador ${playerIndex} termina turno, puntos guardados: ${currentTotal}`);
    
    // Avanzar turno
    nextDadosTurn(roomId);
  });

  socket.on('dadosBankrupt', () => {
    const roomId = socket.dadosRoomId;
    const playerIndex = socket.dadosPlayerIndex;
    
    if (!roomId || !dadosGameRooms[roomId] || playerIndex === undefined) {
      socket.emit('error', { message: 'No estás en una sala de dados válida' });
      return;
    }

    // Verificar si es el turno del jugador
    if (dadosGameRooms[roomId].currentTurn !== playerIndex) {
      socket.emit('error', { message: 'No es tu turno en el juego de dados' });
      return;
    }

    // Reiniciar puntuaciones del jugador para esta ronda
      // Bancarrota: reset completo de puntuaciones
      dadosGameRooms[roomId].players[playerIndex].scores = [];
      dadosGameRooms[roomId].players[playerIndex].currentRoundScore = 0;
      dadosGameRooms[roomId].players[playerIndex].totalScore = 0;
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('dadosPlayerBankrupt', {
      playerIndex: playerIndex,
      players: dadosGameRooms[roomId].players
    });

      // Informar actualización de puntuaciones (resetTotal = true)
      io.to(roomId).emit('dadosScoreUpdated', {
        playerIndex: playerIndex,
        currentRoundScore: 0,
        players: dadosGameRooms[roomId].players,
        resetTotal: true
      });

    // Avanzar turno
    nextDadosTurn(roomId);
  });

  socket.on('leaveDadosRoom', () => {
    handleDadosPlayerDisconnect(socket);
    socket.emit('leftDadosRoom');
  });

  socket.on('startDadosGame', () => {
    const roomId = socket.dadosRoomId;
    
    if (!roomId || !dadosGameRooms[roomId]) {
      socket.emit('error', { message: 'No estás en una sala de dados válida' });
      return;
    }
  
    // Verificar si el jugador es el creador
    if (socket.id !== dadosGameRooms[roomId].creator) {
      socket.emit('error', { message: 'Solo el creador puede iniciar el juego de dados' });
      return;
    }
  
    // Iniciar juego
    dadosGameRooms[roomId].gameStarted = true;
    dadosGameRooms[roomId].currentTurn = 0; // El primer jugador comienza
    
    // Inicializar el estado de los dados
    dadosGameRooms[roomId].dadosState = {
      valoresDados: ['-', '-', '-', '-'],
      dadosBloqueados: [false, false, false, false],
      total: 0
    };
    
    // Notificar a todos los jugadores que el juego ha comenzado
    io.to(roomId).emit('dadosGameStarted', {
      currentPlayer: dadosGameRooms[roomId].players[0],
      currentPlayerIndex: 0,
      players: dadosGameRooms[roomId].players,
      round: dadosGameRooms[roomId].round,
      gameType: 'dados',
      dadosState: dadosGameRooms[roomId].dadosState
    });
  
    console.log(`Juego de dados iniciado en sala ${roomId}`);
  });
  // Evento para transmitir la animación de los dados a todos los jugadores
  socket.on('dadosAnimacion', (data) => {
    const roomId = socket.dadosRoomId;
    
    if (!roomId || !dadosGameRooms[roomId]) {
      return;
    }
    
    // Enviar la animación a todos los jugadores de la sala excepto al remitente
    socket.to(roomId).emit('dadosAnimacion', data);
  });

// Evento para notificar que comienza una tirada
socket.on('dadosTiradaIniciada', () => {
  const roomId = socket.dadosRoomId;
  
  if (!roomId || !dadosGameRooms[roomId]) {
    return;
  }
  
  // Obtener información del jugador actual
  const playerIndex = socket.dadosPlayerIndex;
  const playerName = dadosGameRooms[roomId].players[playerIndex].name;
  
  // Notificar a todos los demás que el jugador está tirando los dados
  socket.to(roomId).emit('dadosTiradaIniciada', {
    playerName: playerName,
    playerIndex: playerIndex
  });
});

// Evento para manejar la secuencia de animación
socket.on('dadosAnimacionSecuencia', (data) => {
  const roomId = socket.dadosRoomId;
  
  if (!roomId || !dadosGameRooms[roomId]) {
    return;
  }
  
  // Reenviar la secuencia completa a todos los demás jugadores
  socket.to(roomId).emit('dadosAnimacionSecuencia', data);
});

// Evento para manejar los valores finales de los dados
socket.on('dadosValoresFinales', (data) => {
  const roomId = socket.dadosRoomId;
  
  if (!roomId || !dadosGameRooms[roomId]) {
    return;
  }
  
  // Almacenar los valores finales en el estado de la sala
  if (!dadosGameRooms[roomId].dadosState) {
    dadosGameRooms[roomId].dadosState = {
      valoresDados: ['-', '-', '-', '-'],
      dadosBloqueados: [false, false, false, false],
      total: 0
    };
  }
  
  // Actualizar valores de dados
  data.valores.forEach(item => {
    dadosGameRooms[roomId].dadosState.valoresDados[item.dadoId] = item.valor;
  });
  
  // Reenviar los valores finales a todos los jugadores (incluido el remitente)
  // para asegurar la sincronización completa
  io.to(roomId).emit('dadosValoresFinales', data);
});

// Añadir este evento en el servidor (server.js)
socket.on('dadosTiradaCompleta', (data) => {
  const roomId = socket.dadosRoomId;
  
  if (!roomId || !dadosGameRooms[roomId]) {
    socket.emit('error', { message: 'No estás en una sala válida' });
    return;
  }
  
  // Verificar que sea el turno del jugador
  const playerIndex = socket.dadosPlayerIndex;
  if (dadosGameRooms[roomId].currentTurn !== playerIndex) {
    socket.emit('error', { message: 'No es tu turno' });
    return;
  }
  
  // Añadir información del jugador a los datos
  data.playerName = dadosGameRooms[roomId].players[playerIndex].name;
  data.playerIndex = playerIndex;
  
  // Guardar el estado de la tirada en la sala
  dadosGameRooms[roomId].tiradaActual = data;
  
  // Verificar que todas las estructuras de datos estén inicializadas
  if (!dadosGameRooms[roomId].dadosState) {
    dadosGameRooms[roomId].dadosState = {
      valoresDados: ['-', '-', '-', '-'],
      dadosBloqueados: [false, false, false, false],
      total: 0
    };
  }
  
  // Notificar a todos los jugadores sobre la tirada
  io.to(roomId).emit('iniciarTiradaAnimacion', data);
  
  // Programar la evaluación después de la animación
  setTimeout(() => {
    // Actualizar los valores de los dados en el estado de la sala
    data.valoresFinales.forEach(item => {
      dadosGameRooms[roomId].dadosState.valoresDados[item.dadoId] = item.valor;
    });
    
    // Notificar a todos que la animación ha terminado y deben mostrar los valores finales
    io.to(roomId).emit('finalizarTiradaAnimacion', {
      valoresFinales: data.valoresFinales
    });
    
    // Programar la evaluación de la tirada
    setTimeout(() => {
      // Construir el array de dados tirados para evaluar
      const dadosTirados = data.valoresFinales.map(item => ({
        index: item.dadoId,
        valor: item.valor
      }));
      
      // Realizar la evaluación de la tirada
      evaluarTirada(roomId, dadosTirados);
    }, 500); // Retraso para mostrar los valores finales antes de evaluar
  }, data.secuencias[0]?.secuencia.length * 50 + 100 || 700); // Tiempo de animación + pequeño margen
});

// Eventos adicionales para el servidor

// Evento para reiniciar todos los dados
socket.on('dadosReiniciar', function() {
  const roomId = socket.dadosRoomId;
  
  if (!roomId || !dadosGameRooms[roomId]) {
    return;
  }
  
  // Verificar que sea el jugador con el turno actual
  const playerIndex = socket.dadosPlayerIndex;
  if (dadosGameRooms[roomId].currentTurn !== playerIndex) {
    return;
  }
  
  // Actualizar estado en la sala
  if (!dadosGameRooms[roomId].dadosState) {
    dadosGameRooms[roomId].dadosState = {};
  }
  
  // Mantener el total actual pero desbloquear los dados
  const totalActual = dadosGameRooms[roomId].dadosState.total || 0;
  
  dadosGameRooms[roomId].dadosState.dadosBloqueados = [false, false, false, false];
  // No sobreescribimos valoresDados aquí: mantenemos las últimas caras visibles
  dadosGameRooms[roomId].dadosState.total = totalActual; // Mantener los puntos
  
  // Notificar a todos los jugadores
  io.to(roomId).emit('dadosReiniciar');
  
  console.log(`[Sala ${roomId}] Dados reiniciados, puntos conservados: ${totalActual}`);
});

// En server.js, dentro de socket.on('connection', ...)
socket.on('dadosAnimacionActual', (data) => {
  const roomId = socket.dadosRoomId;
  if (!roomId || !dadosGameRooms[roomId]) return;
  
  // Retransmitir a todos los demás jugadores en la sala
  socket.to(roomId).emit('dadosAnimacionMostrar', data);
});

// Modificar la función nextDadosTurn para incluir el reinicio de dados
function nextDadosTurn(roomId) {
  if (!dadosGameRooms[roomId]) return;
  
  // Reiniciar dados para el nuevo turno
  if (!dadosGameRooms[roomId].dadosState) {
    dadosGameRooms[roomId].dadosState = {};
  }
  // Desbloquear dados para el nuevo turno, pero conservar los valores visibles
  dadosGameRooms[roomId].dadosState.dadosBloqueados = [false, false, false, false];
  
  // Avanzar al siguiente jugador
  dadosGameRooms[roomId].currentTurn = (dadosGameRooms[roomId].currentTurn + 1) % dadosGameRooms[roomId].players.length;
  
  // Reiniciar puntuación temporal para el nuevo turno
  const currentPlayer = dadosGameRooms[roomId].players[dadosGameRooms[roomId].currentTurn];
  currentPlayer.currentRoundScore = 0;

  // Reiniciar el total acumulado de la sala para el nuevo jugador (cada jugador empieza con total 0)
  dadosGameRooms[roomId].dadosState.total = 0;
  
  // Si hemos completado una ronda (el turno vuelve al primer jugador)
  if (dadosGameRooms[roomId].currentTurn === 0) {
    // Comprobar victoria al final de la ronda
    const winnerResult = checkDadosVictoryCondition(roomId);
    // Solo avanzar a la siguiente ronda si no hubo ganador
    if (!winnerResult) {
      dadosGameRooms[roomId].round++;
      // Notificar a todos los jugadores el cambio de turno
      io.to(roomId).emit('dadosTurnChanged', {
        currentPlayerIndex: dadosGameRooms[roomId].currentTurn,
        currentPlayer: dadosGameRooms[roomId].players[dadosGameRooms[roomId].currentTurn],
        round: dadosGameRooms[roomId].round,
        players: dadosGameRooms[roomId].players,
        dadosState: dadosGameRooms[roomId].dadosState
      });
    }
  } else {
    // Notificar a todos los jugadores el cambio de turno
    io.to(roomId).emit('dadosTurnChanged', {
      currentPlayerIndex: dadosGameRooms[roomId].currentTurn,
      currentPlayer: dadosGameRooms[roomId].players[dadosGameRooms[roomId].currentTurn],
      round: dadosGameRooms[roomId].round,
      players: dadosGameRooms[roomId].players,
      dadosState: dadosGameRooms[roomId].dadosState
    });
  }
}

// Función para evaluar la tirada y enviar los resultados a todos
// Modificar esta función en server.js
function evaluarTirada(roomId, dadosTirados) {
  console.log(`[Sala ${roomId}] Evaluando tirada: ${JSON.stringify(dadosTirados)}`);
  
  if (!dadosGameRooms[roomId]) return;
  
  const dadosState = dadosGameRooms[roomId].dadosState || {
    dadosBloqueados: [false, false, false, false],
    valoresDados: ['-', '-', '-', '-'],
    total: 0
  };
  
  let puntos = 0;
  let puntuaron = false;
  const resultado = {
    dadosBloqueados: [...dadosState.dadosBloqueados], // Mantener los dados que ya estaban bloqueados
    negras: false,
    dadosConPuntos: [],
    mensaje: '',
    tipo: '',
    puntos: 0,
    puntuaron: false
  };
  
  // Filtrar sólo los dados que no estaban bloqueados previamente
  const dadosDisponibles = dadosTirados.filter(d => !resultado.dadosBloqueados[d.index]);
  
  console.log(`[Sala ${roomId}] Dados disponibles para evaluar: ${JSON.stringify(dadosDisponibles)}`);
  
  // Si no hay dados disponibles, salir temprano
  if (dadosDisponibles.length === 0) {
    resultado.mensaje = "No hay dados disponibles para evaluar";
    resultado.tipo = "mensaje-info";
    io.to(roomId).emit('resultadoTirada', resultado);
    return;
  }
  
  // 1. Evaluar 3 Negras (pierdes todo) - solo entre los dados disponibles
  const negras = dadosDisponibles.filter(d => d.valor === 'N').length;
  if (negras >= 3) {
    resultado.negras = true;
    resultado.mensaje = '¡BANKARROTA! Tres negras detectadas';
    resultado.tipo = 'mensaje-error';
    
    // Enviar resultado a todos los jugadores
    io.to(roomId).emit('resultadoTirada', resultado);

    // Señalizar bancarrota inmediatamente y avanzar turno sin demoras para evitar ventana de race
    io.to(roomId).emit('dadosBancarrota');
    // Resetear puntuaciones del jugador actual (bancarrota completa)
    const playerIdx = dadosGameRooms[roomId].currentTurn;
    const player = dadosGameRooms[roomId].players[playerIdx];
    if (player) {
      player.scores = [];
      player.currentRoundScore = 0;
      player.totalScore = 0;
    }

    // Notificar a todos los jugadores sobre la actualización de puntuaciones
    io.to(roomId).emit('dadosScoreUpdated', {
      playerIndex: playerIdx,
      currentRoundScore: 0,
      players: dadosGameRooms[roomId].players,
      resetTotal: true
    });

    nextDadosTurn(roomId);
    return;
  }
  
  // 2. Evaluar combinaciones de 3 iguales entre los dados disponibles
  const combinaciones = {
    'A': 1000, // 3 Ases = 1000 puntos
    'K': 500,  // 3 Reyes (KKK): 500 puntos
    'Q': 400,  // 3 Reinas (QQQ): 400 puntos
    'J': 300,  // 3 Jotas (JJJ): 300 puntos
    'R': 200   // 3 Rojos (RRR): 200 puntos
  };
  
  // Contar la frecuencia de cada valor en los dados disponibles
  const conteo = {};
  dadosDisponibles.forEach(d => {
    conteo[d.valor] = (conteo[d.valor] || 0) + 1;
  });
  
  console.log(`[Sala ${roomId}] Conteo de valores: ${JSON.stringify(conteo)}`);
  
  // Revisar si hay 3 de algún valor
  let combinacionEncontrada = false;
  for (const [valor, pts] of Object.entries(combinaciones)) {
    if (conteo[valor] && conteo[valor] >= 3) {
      puntos += pts;
      puntuaron = true;
      combinacionEncontrada = true;
      
      // Bloquear los dados con ese valor (solo de los disponibles)
      let bloqueados = 0;
      for (const d of dadosDisponibles) {
        if (d.valor === valor && bloqueados < 3) {
          resultado.dadosBloqueados[d.index] = true;
          resultado.dadosConPuntos.push({
            index: d.index,
            puntos: pts / 3, // Dividir los puntos entre los 3 dados
            tipo: 'combinacion'
          });
          bloqueados++;
        }
      }
      
      resultado.mensaje = `¡3 ${valor}! Suman ${pts} puntos`;
      resultado.tipo = 'mensaje-exito';
      break; // Solo puede haber una combinación de 3 iguales en una tirada
    }
  }
  
  // 3. Evaluar A y K individuales (siempre y cuando no formen parte de un trío)
  // Solo evaluamos los dados disponibles que no han sido bloqueados por una combinación
  for (const d of dadosDisponibles) {
    // Verificar que este dado no haya sido bloqueado por una combinación previa
    if (!resultado.dadosBloqueados[d.index]) {
      if (d.valor === 'A') {
        puntos += 100;
        puntuaron = true;
        resultado.dadosBloqueados[d.index] = true;
        resultado.dadosConPuntos.push({
          index: d.index,
          puntos: 100,
          tipo: 'individual'
        });
      } else if (d.valor === 'K') {
        puntos += 50;
        puntuaron = true;
        resultado.dadosBloqueados[d.index] = true;
        resultado.dadosConPuntos.push({
          index: d.index,
          puntos: 50,
          tipo: 'individual'
        });
      }
    }
  }
  
  // 4. Guardar resultado final
  resultado.puntos = puntos;
  resultado.puntuaron = puntuaron;
  
  if (!puntuaron && dadosDisponibles.length > 0) {
    resultado.mensaje = 'Tirada sin puntos. Pierdes los puntos no guardados y pasa el turno.';
    resultado.tipo = 'mensaje-error';
  } else if (resultado.dadosConPuntos.length > 0) {
    if (!resultado.mensaje) {
      resultado.mensaje = `Tirada con ${puntos} puntos`;
      resultado.tipo = 'mensaje-exito';
    }
  }
  
  // Actualizar estado de los dados en la sala
  dadosGameRooms[roomId].dadosState.dadosBloqueados = resultado.dadosBloqueados;
  
  // Guardar el total actual en el estado de la sala
  const playerIndex = dadosGameRooms[roomId].currentTurn;
  const player = dadosGameRooms[roomId].players[playerIndex];
  const totalAnterior = dadosGameRooms[roomId].dadosState.total || 0;
  
  if (puntuaron) {
    // Actualizar total solo si puntuaron
    dadosGameRooms[roomId].dadosState.total = totalAnterior + puntos;
    console.log(`[Sala ${roomId}] Puntuación: ${puntos} puntos. Total acumulado: ${dadosGameRooms[roomId].dadosState.total}`);
  } else if (dadosDisponibles.length > 0) {
    // Solo resetear total si no puntuaron y había dados disponibles para tirar
    dadosGameRooms[roomId].dadosState.total = 0;
    console.log(`[Sala ${roomId}] Tirada sin puntos. Total reseteado a 0`);
  }
  
  // Enviar resultado a todos los jugadores
  io.to(roomId).emit('resultadoTirada', resultado);
  // Actualizar puntuación y pasar turno si no puntuaron
  if (!puntuaron && dadosDisponibles.length > 0) {
    // Avanzar turno inmediatamente (cliente mostrará animaciones localmente)
    nextDadosTurn(roomId);
  } else {
    // Comprobar si todos los dados están bloqueados
    if (resultado.dadosBloqueados.every(b => b)) {
      // Todos los dados puntuaron, notificar y desbloquear después de mostrar animación
      setTimeout(() => {
        io.to(roomId).emit('todosLosDadosPuntuaron');
        
        // Desbloquear dados en el estado de la sala
        dadosGameRooms[roomId].dadosState.dadosBloqueados = [false, false, false, false];
      }, 1500);
    }
    
    // Actualizar puntuación del jugador actual
    if (player) {
      // Actualizar puntuación temporal
      player.currentRoundScore = dadosGameRooms[roomId].dadosState.total;
      
      // Notificar a todos los jugadores
      io.to(roomId).emit('dadosScoreUpdated', {
        playerIndex: playerIndex,
        currentRoundScore: player.currentRoundScore,
        players: dadosGameRooms[roomId].players,
        resetTotal: false
      });
    }
  }
}
});

// Función para comprobar victoria en el modo de dados
function checkDadosVictoryCondition(roomId) {
  if (!dadosGameRooms[roomId]) return false;
  
  // Buscar jugadores con más de 3000 puntos
  const winners = dadosGameRooms[roomId].players.filter(player => player.totalScore >= 3000);
  
  // Si hay ganadores, determinar el ganador final (mayor puntuación)
  if (winners.length > 0) {
    // Si hay varios con más de 3000, el ganador es el que tenga mayor puntuación
    const winner = winners.reduce((highest, player) => 
      player.totalScore > highest.totalScore ? player : highest, winners[0]);
    
    // Guardar la partida en Firebase
    const gameData = {
      id: roomId,
      players: dadosGameRooms[roomId].players,
      winner: winner,
      rounds: dadosGameRooms[roomId].round,
      timestamp: Date.now(),
      gameMode: 'dados'
    };
    
    // Registrar la partida (función asíncrona, no es necesario esperar)
    registerDadosGame(gameData)
      .then(id => console.log(`Partida de dados guardada con ID: ${id}`))
      .catch(error => console.error('Error al guardar partida de dados:', error));
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('dadosGameWon', {
      winner: winner,
      players: dadosGameRooms[roomId].players
    });
    
    // Reiniciar sala para nueva partida después de 10 segundos
    setTimeout(() => {
      delete dadosGameRooms[roomId];
    }, 10000);
    
    return true; // Indicar que hay un ganador
  }
  
  return false; // Indicar que no hay ganador
}

function checkVictoryCondition(roomId) {
  if (!gameRooms[roomId]) return false;
  
  // Buscar jugadores con más de 3000 puntos
  const winners = gameRooms[roomId].players.filter(player => player.totalScore >= 3000);
  
  // Si hay ganadores, determinar el ganador final (mayor puntuación)
  if (winners.length > 0) {
    // Si hay varios con más de 3000, el ganador es el que tenga mayor puntuación
    const winner = winners.reduce((highest, player) => 
      player.totalScore > highest.totalScore ? player : highest, winners[0]);
    
    // Guardar la partida en Firebase
    const gameData = {
      id: roomId,
      players: gameRooms[roomId].players,
      winner: winner,
      rounds: gameRooms[roomId].round,
      timestamp: Date.now()
    };
    
    // Registrar la partida (función asíncrona, no es necesario esperar)
    registerGame(gameData)
      .then(id => console.log(`Partida guardada con ID: ${id}`))
      .catch(error => console.error('Error al guardar partida:', error));
    
    // Notificar a todos los jugadores
    io.to(roomId).emit('gameWon', {
      winner: winner,
      players: gameRooms[roomId].players
    });
    
    // Reiniciar sala para nueva partida después de 10 segundos
    setTimeout(() => {
      delete gameRooms[roomId];
    }, 10000);
    
    return true; // Indicar que hay un ganador
  }
  
  return false; // Indicar que no hay ganador
}

// Función para avanzar al siguiente turno
function nextTurn(roomId) {
  if (!gameRooms[roomId]) return;
  
  gameRooms[roomId].currentTurn = (gameRooms[roomId].currentTurn + 1) % gameRooms[roomId].players.length;
  
  // Si hemos completado una ronda
  if (gameRooms[roomId].currentTurn === 0) {
    gameRooms[roomId].round++;
  }
  
  // Notificar a todos los jugadores
  io.to(roomId).emit('turnChanged', {
    currentPlayerIndex: gameRooms[roomId].currentTurn,
    currentPlayer: gameRooms[roomId].players[gameRooms[roomId].currentTurn],
    round: gameRooms[roomId].round,
    players: gameRooms[roomId].players
  });
}

function nextDadosTurn(roomId) {
  if (!dadosGameRooms[roomId]) return;
  
  // Avanzar al siguiente jugador
  dadosGameRooms[roomId].currentTurn = (dadosGameRooms[roomId].currentTurn + 1) % dadosGameRooms[roomId].players.length;
  
  // Reiniciar puntuación temporal para el nuevo turno
  const currentPlayer = dadosGameRooms[roomId].players[dadosGameRooms[roomId].currentTurn];
  currentPlayer.currentRoundScore = 0;
  
  // Reiniciar dados para el nuevo turno
  if (!dadosGameRooms[roomId].dadosState) {
    dadosGameRooms[roomId].dadosState = {};
  }
  
  dadosGameRooms[roomId].dadosState.dadosBloqueados = [false, false, false, false];
  dadosGameRooms[roomId].dadosState.valoresDados = ['-', '-', '-', '-'];
  dadosGameRooms[roomId].dadosState.total = 0;
  
  // Si hemos completado una ronda
  if (dadosGameRooms[roomId].currentTurn === 0) {
    dadosGameRooms[roomId].round++;
  }
  
  // Notificar a todos los jugadores
  io.to(roomId).emit('dadosTurnChanged', {
    currentPlayerIndex: dadosGameRooms[roomId].currentTurn,
    currentPlayer: dadosGameRooms[roomId].players[dadosGameRooms[roomId].currentTurn],
    round: dadosGameRooms[roomId].round,
    players: dadosGameRooms[roomId].players,
    dadosState: dadosGameRooms[roomId].dadosState
  });
}
// Función para manejar la desconexión de un jugador
function handlePlayerDisconnect(socket) {
  const roomId = socket.roomId;
  const playerIndex = socket.playerIndex;
  
  if (!roomId || !gameRooms[roomId]) return;
  
  console.log(`Jugador ${socket.id} desconectado de la sala ${roomId}`);
  
  const isCreator = socket.id === gameRooms[roomId].creator;
  
  // Eliminar jugador de la sala
  gameRooms[roomId].players = gameRooms[roomId].players.filter(player => player.id !== socket.id);
  
  // Actualizar índices de jugadores
  for (let i = 0; i < gameRooms[roomId].players.length; i++) {
    const player = gameRooms[roomId].players[i];
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.playerIndex = i;
    }
  }
  
  // Si era el creador, asignar un nuevo creador si hay jugadores
  if (isCreator && gameRooms[roomId].players.length > 0) {
    gameRooms[roomId].creator = gameRooms[roomId].players[0].id;
  }
  
  // Si no hay más jugadores, eliminar la sala
  if (gameRooms[roomId].players.length === 0) {
    delete gameRooms[roomId];
    return;
  }
  
  // Notificar a todos los jugadores
  io.to(roomId).emit('playerLeft', {
    playerId: socket.id,
    players: gameRooms[roomId].players,
    newCreator: isCreator ? gameRooms[roomId].creator : null
  });
  
  // Si el juego ya comenzó y era el turno del jugador que se fue
  if (gameRooms[roomId].gameStarted && gameRooms[roomId].currentTurn >= gameRooms[roomId].players.length) {
    gameRooms[roomId].currentTurn = 0;
    
    // Notificar cambio de turno
    io.to(roomId).emit('turnChanged', {
      currentPlayerIndex: gameRooms[roomId].currentTurn,
      currentPlayer: gameRooms[roomId].players[gameRooms[roomId].currentTurn],
      round: gameRooms[roomId].round,
      players: gameRooms[roomId].players
    });
  }
}

// Función para manejar la desconexión de un jugador en el modo dados
function handleDadosPlayerDisconnect(socket) {
  const roomId = socket.dadosRoomId;
  const playerIndex = socket.dadosPlayerIndex;
  
  if (!roomId || !dadosGameRooms[roomId]) return;
  
  console.log(`Jugador ${socket.id} desconectado de la sala de dados ${roomId}`);
  
  const isCreator = socket.id === dadosGameRooms[roomId].creator;
  
  // Eliminar jugador de la sala
  dadosGameRooms[roomId].players = dadosGameRooms[roomId].players.filter(player => player.id !== socket.id);
  
  // Actualizar índices de jugadores
  for (let i = 0; i < dadosGameRooms[roomId].players.length; i++) {
    const player = dadosGameRooms[roomId].players[i];
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.dadosPlayerIndex = i;
    }
  }
  
  // Si era el creador, asignar un nuevo creador si hay jugadores
  if (isCreator && dadosGameRooms[roomId].players.length > 0) {
    dadosGameRooms[roomId].creator = dadosGameRooms[roomId].players[0].id;
  }
  
  // Si no hay más jugadores, eliminar la sala
  if (dadosGameRooms[roomId].players.length === 0) {
    delete dadosGameRooms[roomId];
    return;
  }
  
  // Notificar a todos los jugadores
  io.to(roomId).emit('dadosPlayerLeft', {
    playerId: socket.id,
    players: dadosGameRooms[roomId].players,
    newCreator: isCreator ? dadosGameRooms[roomId].creator : null
  });
  
  // Si el juego ya comenzó y era el turno del jugador que se fue
  if (dadosGameRooms[roomId].gameStarted && dadosGameRooms[roomId].currentTurn >= dadosGameRooms[roomId].players.length) {
    dadosGameRooms[roomId].currentTurn = 0;
    
    // Notificar cambio de turno
    io.to(roomId).emit('dadosTurnChanged', {
      currentPlayerIndex: dadosGameRooms[roomId].currentTurn,
      currentPlayer: dadosGameRooms[roomId].players[dadosGameRooms[roomId].currentTurn],
      round: dadosGameRooms[roomId].round,
      players: dadosGameRooms[roomId].players
    });
  }
}

// Generar ID único para sala
function generateRoomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Iniciar servidor
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Servidor del juego de casino corriendo en puerto ${PORT}`);
});