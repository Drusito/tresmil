require('dotenv').config();
// Configuración de Firebase
const admin = require('firebase-admin');
// Credenciales de Firebase
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString("utf8"));


let db;

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tresmill-default-rtdb.europe-west1.firebasedatabase.app"
  });

  db = admin.database();
  console.log('Conexión a Firebase establecida correctamente.');
} catch (error) {
  console.error('Error al inicializar Firebase:', error);
  db = {
    ref: () => ({
      push: async () => ({ key: 'offline-' + Date.now() }),
      child: () => ({
        once: async () => ({ exists: () => false, val: () => null }),
        set: async () => null
      }),
      orderByChild: () => ({
        limitToLast: () => ({
          once: async () => ({
            forEach: () => null,
            val: () => null
          })
        }),
        once: async () => ({
          forEach: () => null,
          val: () => null
        })
      })
    })
  };
}

async function registerGame(gameData) {
  try {
    if (!db) return null;

    const gamesRef = db.ref('games');
    const newGameRef = await gamesRef.push(gameData);

    // Añadir ID al gameData antes de actualizar estadísticas
    gameData.id = newGameRef.key;

    console.log('Partida registrada con ID:', newGameRef.key);

    await updatePlayerStats(gameData);

    return newGameRef.key;
  } catch (error) {
    console.error('Error al registrar partida:', error);
    return null;
  }
}

async function registerDadosGame(gameData) {
  try {
    if (!db) return null;

    // Asegurarse de que tenga el flag de modo dados
    gameData.gameMode = 'dados';

    const gamesRef = db.ref('dados_games');
    const newGameRef = await gamesRef.push(gameData);

    // Añadir ID al gameData antes de actualizar estadísticas
    gameData.id = newGameRef.key;

    console.log('Partida de dados registrada con ID:', newGameRef.key);

    await updatePlayerStats(gameData);

    return newGameRef.key;
  } catch (error) {
    console.error('Error al registrar partida de dados:', error);
    return null;
  }
}

async function updatePlayerStats(gameData) {
  try {
    if (!db) return;

    const playersRef = db.ref('players');

    for (const player of gameData.players) {
      if (!player.name) continue;

      const playerName = player.name;
      const isWinner = player.id === gameData.winner.id;
      const score = player.totalScore;

      const playerRef = playersRef.child(encodePlayerName(playerName));
      const snapshot = await playerRef.once('value');

      const playerData = snapshot.exists() ? snapshot.val() : {
        name: playerName,
        totalGames: 0,
        wins: 0,
        totalScore: 0,
        highestScore: 0,
        lowestScore: score > 0 ? score : 0,
        gamesPlayed: []
      };

      playerData.totalGames += 1;
      if (isWinner) playerData.wins += 1;
      playerData.totalScore += score;
      playerData.highestScore = Math.max(playerData.highestScore, score);

      if (score > 0) {
        if (playerData.lowestScore === 0 || score < playerData.lowestScore) {
          playerData.lowestScore = score;
        }
      }

      if (!playerData.gamesPlayed) playerData.gamesPlayed = [];
      playerData.gamesPlayed.push(gameData.id);

      // Añadir información sobre el tipo de juego
      if (!playerData.gameTypes) playerData.gameTypes = {};
      const gameType = gameData.gameMode || 'standard';
      if (!playerData.gameTypes[gameType]) {
        playerData.gameTypes[gameType] = {
          games: 0,
          wins: 0,
          totalScore: 0
        };
      }
      playerData.gameTypes[gameType].games += 1;
      if (isWinner) playerData.gameTypes[gameType].wins += 1;
      playerData.gameTypes[gameType].totalScore += score;

      await playerRef.set(playerData);
    }
  } catch (error) {
    console.error('Error al actualizar estadísticas de jugador:', error);
  }
}

async function getGameHistory(limit = 10) {
  try {
    if (!db) return [];

    const allGames = [];
    
    // Obtener partidas estándar
    const gamesRef = db.ref('games');
    const gamesSnapshot = await gamesRef.orderByChild('timestamp').limitToLast(limit).once('value');
    
    gamesSnapshot.forEach(childSnapshot => {
      const game = {
        id: childSnapshot.key,
        ...childSnapshot.val(),
        gameMode: 'standard'
      };
      // Asegurarse de que gameMode esté establecido incluso para partidas antiguas
      if (!game.gameMode) game.gameMode = 'standard';
      allGames.push(game);
    });
    
    // Obtener partidas de dados
    const dadosGamesRef = db.ref('dados_games');
    const dadosGamesSnapshot = await dadosGamesRef.orderByChild('timestamp').limitToLast(limit).once('value');
    
    dadosGamesSnapshot.forEach(childSnapshot => {
      const game = {
        id: childSnapshot.key,
        ...childSnapshot.val(),
        gameMode: 'dados'
      };
      allGames.push(game);
    });
    
    // Ordenar por timestamp y devolver los más recientes
    return allGames
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  } catch (error) {
    console.error('Error al obtener historial de partidas:', error);
    return [];
  }
}

async function getPlayerStats() {
  try {
    if (!db) return [];

    const playersRef = db.ref('players');
    const snapshot = await playersRef.orderByChild('wins').once('value');
    const players = [];

    snapshot.forEach(childSnapshot => {
      const playerData = childSnapshot.val();
      
      // Añadir estadísticas para el modo dados si existen
      if (playerData.gameTypes && playerData.gameTypes.dados) {
        playerData.dadosGames = playerData.gameTypes.dados.games || 0;
        playerData.dadosWins = playerData.gameTypes.dados.wins || 0;
        playerData.dadosTotalScore = playerData.gameTypes.dados.totalScore || 0;
      } else {
        playerData.dadosGames = 0;
        playerData.dadosWins = 0;
        playerData.dadosTotalScore = 0;
      }
      
      players.push(playerData);
    });

    return players.sort((a, b) => b.wins - a.wins);
  } catch (error) {
    console.error('Error al obtener estadísticas de jugadores:', error);
    return [];
  }
}

// Nueva función para obtener el historial específico de partidas de dados
async function getDadosGameHistory(limit = 10) {
  try {
    if (!db) return [];

    const dadosGamesRef = db.ref('dados_games');
    const snapshot = await dadosGamesRef.orderByChild('timestamp').limitToLast(limit).once('value');
    const games = [];

    snapshot.forEach(childSnapshot => {
      games.push({
        id: childSnapshot.key,
        ...childSnapshot.val(),
        gameMode: 'dados'
      });
    });

    return games.reverse();
  } catch (error) {
    console.error('Error al obtener historial de partidas de dados:', error);
    return [];
  }
}

function encodePlayerName(name) {
  return name.replace(/[.#$/[\]]/g, '_');
}

module.exports = {
  db,
  registerGame,
  registerDadosGame,
  getGameHistory,
  getDadosGameHistory,
  getPlayerStats
};