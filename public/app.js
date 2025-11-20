// Definición de variables globales
const socket = io();
let offlineMode = false;
let offlinePlayers = [];
let offlineCurrentTurn = 0;
let offlineRound = 1;

let currentGameMode = ''; // 'standard', 'dados', 'offline'

let gameState = {
  roomId: null,
  players: [],
  isCreator: false,
  currentTurn: 0,
  round: 1,
  roomCreator: null
};


// Estado para el juego de dados
let dadosGameState = {
  roomId: null,
  players: [],
  isCreator: false,
  currentTurn: 0,
  round: 1,
  roomCreator: null,
  gameType: 'dados'
};

// Variables para controlar si ya se cargaron los datos
let historyDataLoaded = false;
let playersDataLoaded = false;

// Variables específicas para el modo dados
// Valores posibles de los dados
const valores = ['A', 'K', 'Q', 'J', 'R', 'N'];

// Estado para el juego de dados
let total = 0;
let dadosBloqueados = [false, false, false, false];
let valoresDados = ['', '', '', ''];
let tiradaEnProceso = false;

// Función para copiar texto al portapapeles
function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const text = element.textContent;
  
  // Crear un elemento temporal para copiar
  const tempInput = document.createElement('input');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand('copy');
  document.body.removeChild(tempInput);
  
  // Mostrar notificación
  showNotification(`Código ${text} copiado al portapapeles`, 'success');
}

function showScreen(screenId) {
  console.log('Cambiando a pantalla:', screenId);
  
  // Ocultar todas las pantallas
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.add('hidden');
  });
  
  // Mostrar la pantalla solicitada
  const screenToShow = document.getElementById(screenId + '-screen');
  if (screenToShow) {
    screenToShow.classList.remove('hidden');
  } else {
    console.error(`Pantalla no encontrada: ${screenId}-screen`);
  }
}

// Función para crear inputs de jugadores en modo offline
function createOfflinePlayerInputs() {
  console.log('Creando inputs para jugadores offline...');
  const playerCount = parseInt(document.getElementById('offline-player-count').value);
  
  if (isNaN(playerCount) || playerCount < 1 || playerCount > 8) {
    showNotification('Por favor, introduce un número válido de jugadores (1-8)', 'error');
    return;
  }
  
  const offlinePlayerInputs = document.getElementById('offline-player-inputs');
  offlinePlayerInputs.innerHTML = '';
  offlinePlayerInputs.classList.remove('hidden');
  
  for (let i = 0; i < playerCount; i++) {
    const inputDiv = document.createElement('div');
    inputDiv.className = 'player-input';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `offline-player-${i}`;
    input.placeholder = `Nombre del Jugador ${i + 1}`;
    input.className = 'player-name-input';
    
    inputDiv.appendChild(input);
    offlinePlayerInputs.appendChild(inputDiv);
  }
  
  // Mostrar botón de iniciar juego
  document.getElementById('start-offline-game').classList.remove('hidden');
}

// Función para iniciar juego en modo offline
function startOfflineGame() {
  console.log('Iniciando juego offline...');
  const playerCount = parseInt(document.getElementById('offline-player-count').value);
  
  if (playerCount < 1) {
    showNotification('Debes tener al menos un jugador', 'error');
    return;
  }
  
  offlinePlayers = [];
  
  // Crear array de jugadores
  for (let i = 0; i < playerCount; i++) {
    const nameInput = document.getElementById(`offline-player-${i}`);
    if (!nameInput) continue;
    
    const playerName = nameInput.value.trim() || `Jugador ${i + 1}`;
    
    offlinePlayers.push({
      id: `offline-${i}`,
      name: playerName,
      scores: [],
      currentRoundScore: 0,
      totalScore: 0
    });
  }
  
  offlineMode = true;
  offlineCurrentTurn = 0;
  offlineRound = 1;
  
  // Configurar pantalla de juego
  document.getElementById('round-counter').textContent = `Ronda: ${offlineRound}`;
  document.getElementById('current-player-name').textContent = offlinePlayers[0].name;
  
  // Crear contadores
  createOfflinePlayerCounters();
  
  // Mostrar controles
  document.getElementById('game-controls').classList.remove('hidden');
  
  showScreen('game');
  showNotification('¡Juego local iniciado!', 'success');
}

// Función para crear contadores en modo offline
function createOfflinePlayerCounters() {
  const countersContainer = document.getElementById('counters-container');
  countersContainer.innerHTML = '';
  
  offlinePlayers.forEach((player, index) => {
    const counterDiv = document.createElement('div');
    counterDiv.className = 'player-counter';
    counterDiv.id = `player-${index}`;
    
    // Marcar el jugador activo
    if (index === offlineCurrentTurn) {
      counterDiv.classList.add('active-turn');
    }
    
    // Añadir contenido
    counterDiv.innerHTML = `
      <h3>${player.name}</h3>
      <div class="score-display">${player.totalScore}</div>
      <div class="current-round-score">Esta ronda: ${player.currentRoundScore}</div>
    `;
    
    countersContainer.appendChild(counterDiv);
  });
}

// Función para actualizar contadores en modo offline
function updateOfflinePlayerCounters() {
  offlinePlayers.forEach((player, index) => {
    const counterDiv = document.getElementById(`player-${index}`);
    
    if (counterDiv) {
      // Actualizar valores
      const scoreDisplay = counterDiv.querySelector('.score-display');
      const currentRoundScore = counterDiv.querySelector('.current-round-score');
      
      if (scoreDisplay) {
        scoreDisplay.textContent = player.totalScore;
      }
      
      if (currentRoundScore) {
        currentRoundScore.textContent = `Esta ronda: ${player.currentRoundScore}`;
      }
      
      // Marcar turno activo
      if (index === offlineCurrentTurn) {
        counterDiv.classList.add('active-turn');
      } else {
        counterDiv.classList.remove('active-turn');
      }
    }
  });
  
  // Actualizar información de turno en la pantalla
  document.getElementById('round-counter').textContent = `Ronda: ${offlineRound}`;
  document.getElementById('current-player-name').textContent = offlinePlayers[offlineCurrentTurn].name;
}

// Función para avanzar turno en modo offline
function nextOfflineTurn() {
  offlineCurrentTurn++;
  
  // Si hemos completado una ronda
  if (offlineCurrentTurn >= offlinePlayers.length) {
    offlineCurrentTurn = 0;
    offlineRound++;
  }
  
  updateOfflinePlayerCounters();
}

// Función para comprobar la victoria al final de la ronda en modo offline
function checkVictoryCondition() {
  // Buscar jugadores con más de 3000 puntos
  const winners = offlinePlayers.filter(player => player.totalScore >= 3000);
  
  // Si hay ganadores, determinar el ganador final (mayor puntuación)
  if (winners.length > 0) {
    // Si hay varios con más de 3000, el ganador es el que tenga mayor puntuación
    const winner = winners.reduce((highest, player) => 
      player.totalScore > highest.totalScore ? player : highest, winners[0]);
    
    // Mostrar modal de victoria
    document.getElementById('winner-name').textContent = winner.name;
    document.getElementById('winner-score').textContent = winner.totalScore;
    document.getElementById('victory-modal').style.display = 'flex';
    document.getElementById('game-controls').classList.add('hidden');
    
    return true; // Indicar que hay un ganador
  }
  
  return false; // Indicar que no hay ganador
}

// Función para sincronizar el estado del juego con los datos recibidos del servidor
function syncGameState(data) {
  // Si tenemos un currentPlayerIndex en los datos, sincronizar el estado del juego
  if (data.currentPlayerIndex !== undefined) {
    gameState.currentTurn = data.currentPlayerIndex;
  }
  
  // Si tenemos un array de jugadores, actualizar nuestro array de jugadores
  if (data.players) {
    gameState.players = data.players;
  }
  
  // Si tenemos un número de ronda, actualizar nuestra ronda
  if (data.round) {
    gameState.round = data.round;
  }
  
  // Actualizar elementos UI
  document.getElementById('round-counter').textContent = `Ronda: ${gameState.round}`;
  if (data.currentPlayer) {
    document.getElementById('current-player-name').textContent = data.currentPlayer.name;
  }
  
  // Mostrar/ocultar controles según corresponda
  if (data.currentPlayer && data.currentPlayer.id === socket.id) {
    document.getElementById('game-controls').classList.remove('hidden');
  } else {
    document.getElementById('game-controls').classList.add('hidden');
  }
  
  // Actualizar contadores visuales
  updatePlayerCounters(gameState.players);
}

function syncDadosGameState(data) {
  // Si tenemos un currentPlayerIndex en los datos, sincronizar el estado del juego
  if (data.currentPlayerIndex !== undefined) {
    dadosGameState.currentTurn = data.currentPlayerIndex;
  }
  
  // Si tenemos un array de jugadores, actualizar nuestro array de jugadores
  if (data.players) {
    dadosGameState.players = data.players;
  }
  
  // Si tenemos un número de ronda, actualizar nuestra ronda
  if (data.round) {
    dadosGameState.round = data.round;
  }
  
  // Actualizar elementos UI
  document.getElementById('dados-round-counter').textContent = `Ronda: ${dadosGameState.round}`;
  if (data.currentPlayer) {
    document.getElementById('turno-jugador').textContent = data.currentPlayer.name;
    document.getElementById('dados-current-player-name').textContent = data.currentPlayer.name;
  }
  
  // Mostrar/ocultar controles según corresponda
  const esMiTurno = data.currentPlayer && data.currentPlayer.id === socket.id;
  if (esMiTurno) {
    document.getElementById('dados-game-controls').classList.remove('hidden');
  } else {
    document.getElementById('dados-game-controls').classList.add('hidden');
  }
  
  // Actualizar contadores visuales
  updateDadosPlayerCounters(dadosGameState.players);
  
  // Si tenemos datos de dados, actualizar el estado de los dados
  if (data.dadosState) {
    // Sincronizar valores de dados
    valoresDados = data.dadosState.valoresDados;
    dadosBloqueados = data.dadosState.dadosBloqueados;
    total = data.dadosState.total || 0;
    
    // Actualizar visualización de dados
    for (let i = 0; i < 4; i++) {
      const dado = document.getElementById(`dado${i + 1}`);
      if (dado) {
        dado.textContent = valoresDados[i];
        dado.style.backgroundImage = valoresDados[i] !== '-' ? 
          `url(images/dados/${valoresDados[i]}.png)` : 'none';
        
        if (dadosBloqueados[i]) {
          dado.classList.add('bloqueado');
        } else {
          dado.classList.remove('bloqueado');
        }
      }
    }
    
    // Actualizar puntos
    actualizarPuntos();
  }
  
  // Actualizar estado de los botones
  actualizarEstadoBotones();
    
  // Mostrar log para todos (no solo para el jugador actual)
  document.getElementById('log-container').classList.remove('hidden');
}

// Modificación 8: Añadir inicialización de eventos cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM cargado, iniciando aplicación...');
  showScreen('main-menu');
  
  // Inicializar botones de dados
  const btnLanzar = document.getElementById('lanzar-dados');
  const btnPlantarse = document.getElementById('plantarse-dados');
  
  if (btnLanzar) {
    btnLanzar.addEventListener('click', lanzarDados);
    console.log('Evento de lanzar dados registrado');
  }
  
  if (btnPlantarse) {
    btnPlantarse.addEventListener('click', plantarseDados);
    console.log('Evento de plantarse registrado');
  }
});
// Funciones para el juego
function increaseScore() {
  if (offlineMode) {
    offlinePlayers[offlineCurrentTurn].currentRoundScore += 50;
    updateOfflinePlayerCounters();
  } else {
    socket.emit('increaseScore');
  }
}

function decreaseScore() {
  if (offlineMode) {
    offlinePlayers[offlineCurrentTurn].currentRoundScore -= 50;
    updateOfflinePlayerCounters();
  } else {
    socket.emit('decreaseScore');
  }
}

function declareBankruptcy() {
  if (offlineMode) {
    offlinePlayers[offlineCurrentTurn].scores = [];
    offlinePlayers[offlineCurrentTurn].currentRoundScore = 0;
    offlinePlayers[offlineCurrentTurn].totalScore = 0;
    
    document.getElementById('bankrupt-modal').style.display = 'flex';
    
    setTimeout(() => {
      nextOfflineTurn();
    }, 1000);
    
    updateOfflinePlayerCounters();
  } else {
    socket.emit('bankrupt');
  }
}

function finishTurn() {
  if (offlineMode) {
    const currentPlayer = offlinePlayers[offlineCurrentTurn];
    
    // Guardar puntuación
    currentPlayer.scores.push(currentPlayer.currentRoundScore);
    currentPlayer.totalScore = currentPlayer.scores.reduce((a, b) => a + b, 0);
    currentPlayer.currentRoundScore = 0;
    
    // Incrementamos el turno
    offlineCurrentTurn++;
    
    // Si hemos completado una ronda
    if (offlineCurrentTurn >= offlinePlayers.length) {
      // Comprobar victoria al final de la ronda
      const hasWinner = checkVictoryCondition();
      
      // Reiniciar turno y aumentar ronda solo si no hay ganador
      if (!hasWinner) {
        offlineCurrentTurn = 0;
        offlineRound++;
        // Actualizar contadores
        updateOfflinePlayerCounters();
      }
    } else {
      // Si no hemos completado la ronda, actualizar contadores
      updateOfflinePlayerCounters();
    }
  } else {
    socket.emit('finishTurn');
  }
}

function exitGame() {
  if (offlineMode) {
    offlineMode = false;
    showScreen('main-menu');
  } else {
    leaveRoom();
  }
}

// Funciones para modo online
function createRoom() {
  const playerName = document.getElementById('player-name').value.trim() || `Jugador${Math.floor(Math.random() * 1000)}`;
  
  socket.emit('createRoom', {
    playerName: playerName,
    maxPlayers: 8,
    gameType: 'normal'
  });
}

// Función para crear sala de dados (corregida)
function createDadosRoom() {
  const playerName = document.getElementById('dados-player-name').value.trim() || `Jugador${Math.floor(Math.random() * 1000)}`;
  
  console.log('Creando sala de dados para:', playerName);
  
  socket.emit('createDadosRoom', {
    playerName: playerName,
    maxPlayers: 8
  });
}

function joinRoom() {
  const playerName = document.getElementById('player-name').value.trim() || `Jugador${Math.floor(Math.random() * 1000)}`;
  const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
  
  if (!roomCode) {
    showNotification('Introduce un código de sala válido', 'error');
    return;
  }
  
  socket.emit('joinRoom', {
    playerName: playerName,
    roomId: roomCode
  });
}

// Función para unirse a sala de dados (corregida)
function joinDadosRoom() {
  const playerName = document.getElementById('dados-player-name').value.trim() || `Jugador${Math.floor(Math.random() * 1000)}`;
  const roomCode = document.getElementById('dados-room-code').value.trim().toUpperCase();
  
  if (!roomCode) {
    showNotification('Introduce un código de sala válido', 'error');
    return;
  }
  
  socket.emit('joinDadosRoom', {
    playerName: playerName,
    roomId: roomCode
  });
}

function leaveRoom() {
  socket.emit('leaveRoom');
  showScreen('online-menu');
}

function leaveDadosRoom() {
  socket.emit('leaveDadosRoom');
  showScreen('dados-menu');
}

function startGame() {
  socket.emit('startGame');
}

// Función para iniciar juego de dados (corregida)
function startDadosGame() {
  socket.emit('startDadosGame');
}

// Función para actualizar lista de jugadores
function updatePlayerList(players) {
  const playerList = document.getElementById('player-list');
  playerList.innerHTML = '';
  
  players.forEach((player) => {
    const li = document.createElement('li');
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'player-icon';
    iconSpan.innerHTML = '<i class="fas fa-user"></i>';
    li.appendChild(iconSpan);
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    li.appendChild(nameSpan);
    
    // Marcar el creador de la sala
    if (player.id === gameState.roomCreator) {
      const creatorBadge = document.createElement('span');
      creatorBadge.className = 'creator-badge';
      creatorBadge.textContent = 'Anfitrión';
      li.appendChild(creatorBadge);
    }
    
    playerList.appendChild(li);
  });
}

// Función para actualizar lista de jugadores en modo dados
function updateDadosPlayerList(players) {
  const playerList = document.getElementById('dados-player-list');
  playerList.innerHTML = '';
  
  players.forEach((player) => {
    const li = document.createElement('li');
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'player-icon';
    iconSpan.innerHTML = '<i class="fas fa-user"></i>';
    li.appendChild(iconSpan);
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    li.appendChild(nameSpan);
    
    // Marcar el creador de la sala
    if (player.id === dadosGameState.roomCreator) {
      const creatorBadge = document.createElement('span');
      creatorBadge.className = 'creator-badge';
      creatorBadge.textContent = 'Anfitrión';
      li.appendChild(creatorBadge);
    }
    
    playerList.appendChild(li);
  });
}

// Función para crear contadores en modo online
function createPlayerCounters(players) {
  const countersContainer = document.getElementById('counters-container');
  countersContainer.innerHTML = '';
  
  players.forEach((player, index) => {
    const counterDiv = document.createElement('div');
    counterDiv.className = 'player-counter';
    counterDiv.id = `player-${index}`;
    
    // Marcar el jugador activo
    if (index === gameState.currentTurn) {
      counterDiv.classList.add('active-turn');
    }
    
    // Añadir contenido
    counterDiv.innerHTML = `
      <h3>${player.name}</h3>
      <div class="score-display">${player.totalScore}</div>
      <div class="current-round-score">Esta ronda: ${player.currentRoundScore}</div>
    `;
    
    countersContainer.appendChild(counterDiv);
  });
}

// Función para crear el scoreboard compacto
function createDadosPlayerCounters(players) {
  // Asegúrate de que el scoreboard existe y está visible
  const scoreboard = document.getElementById('dados-compact-scoreboard');
  if (scoreboard) {
    scoreboard.classList.remove('hidden');
  }
  
  const playersList = document.getElementById('dados-players-list');
  if (!playersList) return;
  
  playersList.innerHTML = '';
  
  players.forEach((player, index) => {
    const playerRow = document.createElement('div');
    playerRow.className = 'player-row';
    playerRow.id = `dados-player-${index}`;
    
    // Marcar el jugador activo
    if (index === dadosGameState.currentTurn) {
      playerRow.classList.add('active-turn');
    }
    
    playerRow.innerHTML = `
      <div class="player-column">${player.name}</div>
      <div class="score-column">${player.totalScore || 0}</div>
      <div class="round-column">${player.currentRoundScore || 0}</div>
    `;
    
    playersList.appendChild(playerRow);
  });
  
  // Ocultar el contenedor antiguo si existe
  const oldContainer = document.getElementById('dados-counters-container');
  if (oldContainer) {
    oldContainer.classList.add('hidden');
  }
}

// Función para actualizar contadores en modo online
function updatePlayerCounters(players) {
  players.forEach((player, index) => {
    const counterDiv = document.getElementById(`player-${index}`);
    
    if (counterDiv) {
      // Actualizar valores
      const scoreDisplay = counterDiv.querySelector('.score-display');
      const currentRoundScore = counterDiv.querySelector('.current-round-score');
      
      if (scoreDisplay) {
        scoreDisplay.textContent = player.totalScore;
      }
      
      if (currentRoundScore) {
        currentRoundScore.textContent = `Esta ronda: ${player.currentRoundScore}`;
      }
      
      // Marcar turno activo
      if (index === gameState.currentTurn) {
        counterDiv.classList.add('active-turn');
      } else {
        counterDiv.classList.remove('active-turn');
      }
    }
  });
}

// Función para actualizar el scoreboard compacto
function updateDadosPlayerCounters(players) {
  players.forEach((player, index) => {
    const playerRow = document.getElementById(`dados-player-${index}`);
    
    if (playerRow) {
      // Actualizar valores
      const scoreColumn = playerRow.querySelector('.score-column');
      const roundColumn = playerRow.querySelector('.round-column');
      
      if (scoreColumn) {
        scoreColumn.textContent = player.totalScore || 0;
      }
      
      if (roundColumn) {
        roundColumn.textContent = player.currentRoundScore || 0;
      }
      
      // Marcar turno activo
      if (index === dadosGameState.currentTurn) {
        playerRow.classList.add('active-turn');
      } else {
        playerRow.classList.remove('active-turn');
      }
    }
  });
  
  // Actualizar información de turno en la pantalla
  document.getElementById('dados-round-counter').textContent = `Ronda: ${dadosGameState.round}`;
  
  if (dadosGameState.players.length > 0 && dadosGameState.currentTurn < dadosGameState.players.length) {
    const jugadorActual = dadosGameState.players[dadosGameState.currentTurn].name;
    document.getElementById('dados-current-player-name').textContent = jugadorActual;
    document.getElementById('turno-jugador').textContent = jugadorActual;
  }
}

// Función para mostrar notificaciones
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = 'notification';
  
  // Añadir clase según el tipo
  switch (type) {
    case 'error':
      notification.style.backgroundColor = 'var(--danger-color)';
      break;
    case 'success':
      notification.style.backgroundColor = 'var(--success-color)';
      break;
    case 'warning':
      notification.style.backgroundColor = 'var(--warning-color)';
      notification.style.color = 'var(--background-dark)';
      break;
    default:
      notification.style.backgroundColor = 'var(--secondary-color)';
  }
  
  // Mostrar notificación
  notification.classList.add('show');
  
  // Ocultar después de 3 segundos
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Funciones para el modo dados online
function lanzarDadosOnline() {
  socket.emit('lanzarDados');
}

function plantarseDadosOnline() {
  socket.emit('plantarseDados');
}

function exitDadosGame() {
  leaveDadosRoom();
}

// Función para añadir mensajes al log
window.addLog = function(mensaje, tipo = '') {
  const log = document.getElementById('log');
  if (log) {
    log.innerHTML += `<div class="${tipo}">${mensaje}</div>`;
    log.scrollTop = log.scrollHeight;
  }
};

// Eventos de socket
socket.on('roomCreated', function(data) {
  // Sala para juego normal
  gameState.roomId = data.roomId;
  gameState.isCreator = true;
  gameState.roomCreator = socket.id;
  
  document.getElementById('room-code-display').textContent = data.roomId;
  updatePlayerList([data.player]);
  
  document.getElementById('creator-controls').classList.remove('hidden');
  showScreen('waiting-room');
  showNotification('Sala creada con éxito. Código: ' + data.roomId, 'success');
});

// Nuevo evento para sala de dados creada
socket.on('dadosRoomCreated', function(data) {
  // Sala para juego de dados
  dadosGameState.roomId = data.roomId;
  dadosGameState.isCreator = true;
  dadosGameState.roomCreator = socket.id;
  
  document.getElementById('dados-room-code-display').textContent = data.roomId;
  updateDadosPlayerList([data.player]);
  
  document.getElementById('dados-creator-controls').classList.remove('hidden');
  showScreen('dados-waiting-room');
  showNotification('Sala de dados creada con éxito. Código: ' + data.roomId, 'success');
});

socket.on('roomJoined', function(data) {
  // Sala para juego normal
  gameState.roomId = data.roomId;
  gameState.isCreator = data.isCreator;
  gameState.players = data.players;
  gameState.roomCreator = data.creatorId;
  
  document.getElementById('room-code-display').textContent = data.roomId;
  updatePlayerList(data.players);
  
  if (data.isCreator) {
    document.getElementById('creator-controls').classList.remove('hidden');
  } else {
    document.getElementById('creator-controls').classList.add('hidden');
  }
  
  showScreen('waiting-room');
  showNotification('Te has unido a la sala', 'success');
});

// Nuevo evento para unirse a sala de dados
socket.on('dadosRoomJoined', function(data) {
  // Sala para juego de dados
  dadosGameState.roomId = data.roomId;
  dadosGameState.isCreator = data.isCreator;
  dadosGameState.players = data.players;
  dadosGameState.roomCreator = data.creatorId;
  
  document.getElementById('dados-room-code-display').textContent = data.roomId;
  updateDadosPlayerList(data.players);
  
  if (data.isCreator) {
    document.getElementById('dados-creator-controls').classList.remove('hidden');
  } else {
    document.getElementById('dados-creator-controls').classList.add('hidden');
  }
  
  showScreen('dados-waiting-room');
  showNotification('Te has unido a la sala de dados', 'success');
});

socket.on('playerJoined', function(data) {
  // Actualizar para juego normal
  gameState.players = data.players;
  updatePlayerList(data.players);
  showNotification(`${data.player.name} se ha unido a la sala`, 'info');
});

// Nuevo evento para jugador unido a sala de dados
socket.on('dadosPlayerJoined', function(data) {
  // Actualizar para juego de dados
  dadosGameState.players = data.players;
  updateDadosPlayerList(data.players);
  showNotification(`${data.player.name} se ha unido a la sala de dados`, 'info');
});

socket.on('playerLeft', function(data) {
  // Actualizar para juego normal
  gameState.players = data.players;
  updatePlayerList(data.players);
  
  if (data.newCreator && data.newCreator === socket.id) {
    gameState.isCreator = true;
    document.getElementById('creator-controls').classList.remove('hidden');
    showNotification('Ahora eres el anfitrión de la sala', 'info');
  }
  
  showNotification('Un jugador ha abandonado la sala', 'info');
});

// Nuevo evento para jugador que abandona sala de dados
socket.on('dadosPlayerLeft', function(data) {
  // Actualizar para juego de dados
  dadosGameState.players = data.players;
  updateDadosPlayerList(data.players);
  
  if (data.newCreator && data.newCreator === socket.id) {
    dadosGameState.isCreator = true;
    document.getElementById('dados-creator-controls').classList.remove('hidden');
    showNotification('Ahora eres el anfitrión de la sala de dados', 'info');
  }
  
  showNotification('Un jugador ha abandonado la sala de dados', 'info');
});

socket.on('gameStarted', function(data) {
  // Iniciar juego normal
  syncGameState(data);
  
  // Crear contadores de jugadores
  createPlayerCounters(data.players);
  
  showScreen('game');
  showNotification('¡El juego ha comenzado!', 'success');
});

// Nuevo evento para inicio de juego de dados
socket.on('dadosGameStarted', function(data) {
  // Sincronizar el estado del juego con los datos recibidos
  syncDadosGameState(data);
  
  // Resetear los dados
  resetearDados();
  
  // Mostrar log para todos los jugadores
  document.getElementById('log-container').classList.remove('hidden');
  
  // Crear contadores de jugadores con el nuevo scoreboard
  createDadosPlayerCounters(data.players);
  
  // Limpiar log
  document.getElementById('log').innerHTML = '';
  addLog('¡Juego de dados iniciado!', 'mensaje-exito');
  
  showScreen('dados-game');
  showNotification('¡El juego de dados ha comenzado!', 'success');
});
socket.on('updateDadosState', function(data) {
  const roomId = socket.dadosRoomId;
  
  if (!roomId || !dadosGameRooms[roomId]) {
    return;
  }
  
  // Guardar el estado actual de los dados en la sala
  if (!dadosGameRooms[roomId].dadosState) {
    dadosGameRooms[roomId].dadosState = {};
  }
  
  // Actualizar el estado
  dadosGameRooms[roomId].dadosState = {
    valoresDados: data.valoresDados,
    dadosBloqueados: data.dadosBloqueados,
    total: data.total
  };
  
  // Enviar actualización a todos los jugadores de la sala
  io.to(roomId).emit('dadosActualizados', {
    valoresDados: data.valoresDados,
    dadosBloqueados: data.dadosBloqueados,
    total: data.total,
    logMessage: data.logMessage,
    logType: data.logType
  });
});
socket.on('turnChanged', function(data) {
  // Cambio de turno en juego normal
  syncGameState(data);
  
  // Mostrar notificación solo si es nuestro turno
  if (data.currentPlayer && data.currentPlayer.id === socket.id) {
    showNotification('¡Es tu turno!', 'info');
  }
});

// Nuevo evento para cambio de turno en juego de dados
socket.on('dadosTurnChanged', function(data) {
  // Sincronizar el estado del juego
  syncDadosGameState(data);
  
  // Resetear el estado de tirada en proceso
  tiradaEnProceso = false;
  
  // Verificar si es nuestro turno y actualizar botones
  const miIndice = dadosGameState.players.findIndex(p => p.id === socket.id);
  if (miIndice === dadosGameState.currentTurn) {
    // Es nuestro turno - habilitar botones
    document.getElementById('lanzar-dados').disabled = false;
    document.getElementById('plantarse-dados').disabled = false;
    showNotification('¡Es tu turno en el juego de dados!', 'info');
  } else {
    // No es nuestro turno - deshabilitar botones
    document.getElementById('lanzar-dados').disabled = true;
    document.getElementById('plantarse-dados').disabled = true;
  }
  
  // Resetear total para nuevo turno
  if (miIndice === dadosGameState.currentTurn) {
    total = 0;
    actualizarPuntos();
  }
});

socket.on('scoreUpdated', function(data) {
  // Actualizar score en juego normal
  gameState.players = data.players;
  
  const playerCounter = document.getElementById(`player-${data.playerIndex}`);
  if (playerCounter) {
    const currentRoundScore = playerCounter.querySelector('.current-round-score');
    if (currentRoundScore) {
      currentRoundScore.textContent = `Esta ronda: ${data.currentRoundScore}`;
    }
  }
});

socket.on('dadosScoreUpdated', function(data) {
  // Actualizar score en juego de dados
  dadosGameState.players = data.players;
  
  // Actualizar el scoreboard
  updateDadosPlayerCounters(dadosGameState.players);
  
  // Si se resetea el total (bancarrota completa)
  if (data.resetTotal) {
    // Código existente...
  }
  
  // Actualizar puntos guardados en la UI para jugador actual
  const miIndice = dadosGameState.players.findIndex(p => p.id === socket.id);
  if (miIndice !== -1 && document.getElementById('dados-puntos-guardados')) {
    document.getElementById('dados-puntos-guardados').textContent = `Total: ${dadosGameState.players[miIndice].totalScore || 0}`;
  }
});

socket.on('playerBankrupt', function(data) {
  // Bancarrota en juego normal
  gameState.players = data.players;
  
  updatePlayerCounters(data.players);
  
  if (data.playerIndex === gameState.players.findIndex(p => p.id === socket.id)) {
    document.getElementById('bankrupt-modal').style.display = 'flex';
  }
  
  showNotification(`¡${gameState.players[data.playerIndex].name} ha caído en bankarrota!`, 'warning');
});

// Nuevo evento para bancarrota en juego de dados
socket.on('dadosPlayerBankrupt', function(data) {
  // Bancarrota en juego de dados
  dadosGameState.players = data.players;
  
  updateDadosPlayerCounters(data.players);
  
  if (data.playerIndex === dadosGameState.players.findIndex(p => p.id === socket.id)) {
    document.getElementById('bankrupt-modal').style.display = 'flex';
  }
  
  showNotification(`¡${dadosGameState.players[data.playerIndex].name} ha caído en bankarrota!`, 'warning');
});

socket.on('gameWon', function(data) {
  document.getElementById('winner-name').textContent = data.winner.name;
  document.getElementById('winner-score').textContent = data.winner.totalScore;
  document.getElementById('victory-modal').style.display = 'flex';
  
  document.getElementById('game-controls').classList.add('hidden');
  
  if (data.winner.id === socket.id) {
    document.body.classList.add('shimmer');
  }
});

// Actualizado evento para victoria en juego de dados
socket.on('dadosGameWon', function(data) {
  // Mostrar el modal de victoria con los datos del ganador
  document.getElementById('winner-name').textContent = data.winner.name;
  document.getElementById('winner-score').textContent = data.winner.totalScore;
  document.getElementById('victory-modal').style.display = 'flex';
  
  // Ocultar controles
  document.getElementById('dados-game-controls').classList.add('hidden');
  
  // Efectos para el ganador
  if (data.winner.id === socket.id) {
    document.body.classList.add('shimmer');
    showNotification('¡Has ganado la partida!', 'success');
  } else {
    showNotification(`${data.winner.name} ha ganado la partida`, 'info');
  }
});

// Eventos específicos para el juego de dados
socket.on('dadosActualizados', function(data) {
  // Actualizar el estado de los dados
  valoresDados = data.valoresDados;
  dadosBloqueados = data.dadosBloqueados;
  total = data.total;
  
  // Actualizar visualización de dados
  for (let i = 0; i < 4; i++) {
    const dado = document.getElementById(`dado${i + 1}`);
    dado.textContent = valoresDados[i];
    dado.style.backgroundImage = `url(images/dados/${valoresDados[i]}.png)`;
    
    if (dadosBloqueados[i]) {
      dado.classList.add('bloqueado');
    } else {
      dado.classList.remove('bloqueado');
    }
  }
  
  // Actualizar puntos
  document.getElementById('puntos').textContent = `${total}`;
  
  // Si hay mensaje de log, añadirlo
  if (data.logMessage) {
    addLog(data.logMessage, data.logType || '');
  }
});

socket.on('dadosAnimacion', function(data) {
  const dado = document.getElementById(`dado${data.dadoId}`);
  dado.textContent = data.valor;
  dado.style.backgroundImage = `url(images/dados/${data.valor}.png)`;
});

socket.on('dadosAnimacionMostrar', function(data) {
  const dado = document.getElementById(`dado${data.dadoId + 1}`);
  if (!dado) return;
  
  const valorTemp = data.secuencia[data.paso];
  dado.textContent = valorTemp;
  dado.style.backgroundImage = `url(images/dados/${valorTemp}.png)`;
});

socket.on('error', function(data) {
  showNotification(data.message, 'error');
});

// Mantenemos estos eventos de Socket para compatibilidad
socket.on('gameHistoryData', function(data) {
  console.log('Recibidos datos de historial vía Socket.io (método obsoleto)');
});

socket.on('playerStatsData', function(data) {
  console.log('Recibidos datos de estadísticas vía Socket.io (método obsoleto)');
});
socket.on('dadosAnimacion', function(data) {
  const dadoId = data.dadoId;
  const valor = data.valor;
  
  // Identificar el elemento del dado
  const dado = document.getElementById(`dado${dadoId + 1}`);
  
  if (dado) {
    // Actualizar la visualización del dado
    dado.textContent = valor;
    dado.style.backgroundImage = `url(images/dados/${valor}.png)`;
    
    // Si es el valor final de la tirada, verificar si debe ser bloqueado
    if (data.final) {
      // Actualizar el estado local
      valoresDados[dadoId] = valor;
    }
  }
});

// Evento para notificar que un jugador está tirando dados
socket.on('dadosTiradaIniciada', function(data) {
  // Mostrar notificación sobre quién está tirando
  showNotification(`${data.playerName} está tirando los dados...`, 'info');
  
  // Añadir un mensaje en el log
  if (document.getElementById('log')) {
    addLog(`${data.playerName} está tirando los dados...`, 'mensaje-info');
  }
});

// Añadir estos manejadores de eventos al archivo app.js

// Evento para recibir la secuencia de animación
socket.on('dadosAnimacionSecuencia', function(data) {
  const dadoId = data.dadoId;
  const secuencia = data.secuencia;
  
  const dado = document.getElementById(`dado${dadoId + 1}`);
  if (!dado) return;
  
  // Solo ejecutar la animación si el dado no está bloqueado
  if (!dadosBloqueados[dadoId]) {
    let contador = 0;
    
    const interval = setInterval(() => {
      if (contador >= secuencia.length) {
        clearInterval(interval);
        return;
      }
      
      const valorTemp = secuencia[contador];
      
      // Actualizar visualización
      dado.textContent = valorTemp;
      dado.style.backgroundImage = `url(images/dados/${valorTemp}.png)`;
      
      contador++;
    }, 50);
  }
});

// Evento para recibir los valores finales
socket.on('dadosValoresFinales', function(data) {
  // Actualizar los valores de los dados
  data.valores.forEach(item => {
    const dadoId = item.dadoId;
    const valor = item.valor;
    
    // Actualizar estado local
    valoresDados[dadoId] = valor;
    
    // Actualizar visualización
    const dado = document.getElementById(`dado${dadoId + 1}`);
    if (dado) {
      dado.textContent = valor;
      dado.style.backgroundImage = `url(images/dados/${valor}.png)`;
    }
  });
});

// Evento para iniciar la animación de tirada
socket.on('iniciarTiradaAnimacion', function(data) {
  // Mostrar quién está tirando
  const mensaje = `${data.playerName} está tirando los dados...`;
  showNotification(mensaje, 'info');
  addLog(mensaje, 'mensaje-info');
  
  // Ejecutar las animaciones para todos los dados
  data.secuencias.forEach(secuenciaInfo => {
    const dadoId = secuenciaInfo.dadoId;
    const secuencia = secuenciaInfo.secuencia;
    
    const dado = document.getElementById(`dado${dadoId + 1}`);
    if (!dado) return;
    
    // Ejecutar animación
    let contador = 0;
    
    const interval = setInterval(() => {
      if (contador >= secuencia.length) {
        clearInterval(interval);
        return;
      }
      
      const valorTemp = secuencia[contador];
      dado.textContent = valorTemp;
      dado.style.backgroundImage = `url(images/dados/${valorTemp}.png)`;
      
      contador++;
    }, 50);
  });
});

// Evento para mostrar los valores finales después de la animación
socket.on('finalizarTiradaAnimacion', function(data) {
  // Actualizar los valores finales de los dados
  data.valoresFinales.forEach(item => {
    const dadoId = item.dadoId;
    const valor = item.valor;
    
    // Actualizar valor del dado
    valoresDados[dadoId] = valor;
    
    // Actualizar visualización
    const dado = document.getElementById(`dado${dadoId + 1}`);
    if (dado) {
      dado.textContent = valor;
      dado.style.backgroundImage = `url(images/dados/${valor}.png)`;
    }
  });
});

// Evento para mostrar el resultado de la tirada
socket.on('resultadoTirada', function(data) {
  // Actualizar estado de los dados
  dadosBloqueados = [...data.dadosBloqueados];
  
  // Añadir mensaje al log
  addLog(data.mensaje, data.tipo || '');
  
  // Si hay puntos y puntuaron, actualizarlos
  if (data.puntos && data.puntuaron) {
    total += data.puntos;
    actualizarPuntos();
    console.log(`Puntos añadidos: ${data.puntos}, total ahora: ${total}`);
  }
  
  // Si no puntuaron, resetear total
  if (!data.puntuaron) {
    total = 0;
    actualizarPuntos();
    console.log("Tirada sin puntos, reset a 0");
  }
  
  // Si hay dados con puntos, mostrar efectos visuales
  if (data.dadosConPuntos && data.dadosConPuntos.length > 0) {
    data.dadosConPuntos.forEach(dadoInfo => {
      const dadoElement = document.getElementById(`dado${dadoInfo.index + 1}`);
      if (dadoElement) {
        // Añadir clase de bloqueado
        dadoElement.classList.add('bloqueado');
        
        // Añadir animación de resaltado
        dadoElement.classList.add('highlight-animation');
        setTimeout(() => {
          dadoElement.classList.remove('highlight-animation');
        }, 1000);
        
        // Mostrar puntos obtenidos
        if (dadoInfo.tipo === 'individual') {
          addLog(`${valoresDados[dadoInfo.index]} individual en dado ${dadoInfo.index + 1}: +${dadoInfo.puntos} puntos`, 'mensaje-exito');
        }
      }
    });
  }
  
  // Si es tirada con negras, mostrar animación de bancarrota
  if (data.negras) {
    // Añadir animación de shake a los dados con negras
    valoresDados.forEach((valor, index) => {
      if (valor === 'N') {
        const dadoElement = document.getElementById(`dado${index + 1}`);
        if (dadoElement) {
          dadoElement.classList.add('shake-animation');
          setTimeout(() => {
            dadoElement.classList.remove('shake-animation');
          }, 500);
        }
      }
    });
    
    // Resetear total
    total = 0;
    actualizarPuntos();
  }
  
  // Si no puntuaron, mostrar animación de shake en todos los dados
  if (!data.puntuaron && !data.negras) {
    // Efecto visual para todos los dados
    for (let i = 0; i < 4; i++) {
      const dadoElement = document.getElementById(`dado${i + 1}`);
      if (dadoElement) {
        dadoElement.classList.add('shake-animation');
        setTimeout(() => {
          dadoElement.classList.remove('shake-animation');
        }, 500);
      }
    }
    
    // Resetear total
    total = 0;
    actualizarPuntos();
  }
  
  // Actualizar visualización de dados bloqueados
  for (let i = 0; i < 4; i++) {
    const dadoElement = document.getElementById(`dado${i + 1}`);
    if (dadoElement) {
      if (dadosBloqueados[i]) {
        dadoElement.classList.add('bloqueado');
      } else {
        dadoElement.classList.remove('bloqueado');
      }
    }
  }
  
  // Verificar si es nuestro turno y desbloquear botones
  const miIndice = dadosGameState.players.findIndex(p => p.id === socket.id);
  if (miIndice === dadosGameState.currentTurn) {
    tiradaEnProceso = false;
    actualizarEstadoBotones();
  }
});

// Evento para mostrar la bancarrota
socket.on('dadosBancarrota', function() {
  // Mostrar modal de bancarrota
  document.getElementById('bankrupt-modal').style.display = 'flex';
  
  // Reiniciar valores locales
  total = 0;
  actualizarPuntos();
  
  // Ocultar el modal después de un tiempo
  setTimeout(() => {
    document.getElementById('bankrupt-modal').style.display = 'none';
  }, 2000);
});

// Evento para manejar cuando todos los dados puntúan
socket.on('todosLosDadosPuntuaron', function() {
  // Añadir mensaje al log
  addLog('¡Todos los dados puntuaron! Desbloqueando para la siguiente tirada.', 'mensaje-exito');
  
  // Mostrar notificación
  showNotification('¡Todos los dados puntuaron! Puedes seguir tirando o plantarte.', 'success');
  
  // Reiniciar los dados bloqueados después de un breve retraso
  setTimeout(() => {
    dadosBloqueados = [false, false, false, false];
    
    // Actualizar visualmente
    for (let i = 0; i < 4; i++) {
      const dadoElement = document.getElementById(`dado${i + 1}`);
      if (dadoElement) {
        dadoElement.classList.remove('bloqueado');
      }
    }
    
    // Verificar si es nuestro turno y habilitar botones
    const miIndice = dadosGameState.players.findIndex(p => p.id === socket.id);
    if (miIndice === dadosGameState.currentTurn) {
      tiradaEnProceso = false;
      actualizarEstadoBotones();
    }
  }, 500);
});

// Evento para reiniciar dados (cuando no hay dados disponibles)
socket.on('dadosReiniciar', function() {
  reiniciarDados();
  addLog("Reiniciando dados para nueva tirada.", "mensaje-info");
});

// Funciones para resetear dados
function resetearDados() {
  dadosBloqueados = [false, false, false, false];
  valoresDados = ['-', '-', '-', '-'];
  total = 0;
  
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`dado${i}`).textContent = '';
    document.getElementById(`dado${i}`).classList.remove('bloqueado');
  }
  
  document.getElementById('dados-puntos').textContent = `+ 0 pts`;
}

// Función para cargar el historial de partidas desde el servidor
function loadGameHistory() {
  console.log('Iniciando carga de historial de juegos...');
  
  // Mostrar indicador de carga
  document.getElementById('history-loading').style.display = 'flex';
  document.getElementById('game-history-list').innerHTML = '';
  
  // URL del endpoint
  const url = '/api/games/history';
  console.log('Solicitando datos a:', url);
  
  // Solicitar datos al servidor usando fetch
  fetch(url)
    .then(response => {
      console.log('Respuesta recibida:', response.status);
      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log('Datos de historial recibidos:', data ? data.length : 0, 'partidas');
      historyDataLoaded = true;
      document.getElementById('history-loading').style.display = 'none';
      
      const historyContainer = document.getElementById('game-history-list');
      
      if (!data || data.length === 0) {
        historyContainer.innerHTML = `
          <div class="no-data-message">
            No hay partidas guardadas aún. ¡Juega algunas partidas online!
          </div>
        `;
        return;
      }
      
      let historyHTML = '';
      
      data.forEach(game => {
        const date = formatDate(game.timestamp);
        
        let playersHTML = '';
        game.players.forEach(player => {
          const isWinner = player.id === game.winner.id;
          playersHTML += `
            <div class="game-history-player ${isWinner ? 'winner' : ''}">
              <i class="fas fa-user"></i>
              ${player.name}: ${player.totalScore}
            </div>
          `;
        });
        
        historyHTML += `
          <div class="game-history-item">
            <div class="game-history-header">
              <div class="game-history-title">
                <i class="fas fa-trophy"></i> Partida ${game.id.substr(0, 6)}
              </div>
              <div class="game-history-date">${date}</div>
            </div>
            <div class="game-history-winner">
              <span class="winner-icon">👑</span>
              Ganador: ${game.winner.name} con ${game.winner.totalScore} puntos
            </div>
            <div class="game-history-players">
              ${playersHTML}
            </div>
          </div>
        `;
      });
      
      historyContainer.innerHTML = historyHTML;
      console.log('Historial de juegos cargado correctamente');
    })
    .catch(error => {
      console.error('Error al cargar historial:', error);
      document.getElementById('history-loading').style.display = 'none';
      document.getElementById('game-history-list').innerHTML = `
        <div class="no-data-message">
          <i class="fas fa-exclamation-circle"></i>
          Error al cargar datos: ${error.message}
        </div>
      `;
    });
  
  // Timeout de seguridad
  setTimeout(() => {
    if (document.getElementById('history-loading').style.display === 'flex') {
      console.warn('Timeout de carga de historial alcanzado');
      document.getElementById('history-loading').style.display = 'none';
      document.getElementById('game-history-list').innerHTML = `
        <div class="no-data-message">
          <i class="fas fa-exclamation-circle"></i>
          Tiempo de espera agotado. Por favor, inténtalo de nuevo.
        </div>
      `;
    }
  }, 10000);
}

// Función para cargar estadísticas de jugadores desde el servidor
function loadPlayerStats() {
  console.log('Iniciando carga de estadísticas de jugadores...');
  
  // Mostrar indicador de carga
  document.getElementById('players-loading').style.display = 'flex';
  document.getElementById('players-stats-list').innerHTML = '';
  
  // URL del endpoint
  const url = '/api/players/stats';
  console.log('Solicitando datos a:', url);
  
  // Solicitar datos al servidor usando fetch
  fetch(url)
    .then(response => {
      console.log('Respuesta recibida:', response.status);
      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log('Datos de jugadores recibidos:', data ? data.length : 0, 'jugadores');
      playersDataLoaded = true;
      document.getElementById('players-loading').style.display = 'none';
      
      const playersContainer = document.getElementById('players-stats-list');
      
      if (!data || data.length === 0) {
        playersContainer.innerHTML = `
          <div class="no-data-message">
            No hay estadísticas de jugadores aún. ¡Juega algunas partidas online!
          </div>
        `;
        return;
      }
      
      let playersHTML = '';
      
      data.forEach((player, index) => {
        // Calcular porcentaje de victorias
        const winRate = player.totalGames > 0 ? Math.round((player.wins / player.totalGames) * 100) : 0;
        
        // Calcular promedio de puntos
        const avgScore = player.totalGames > 0 ? Math.round(player.totalScore / player.totalGames) : 0;
        
        playersHTML += `
          <div class="player-stats-item">
            <div class="player-stats-header">
              <div class="player-stats-name">
                <span class="rank-number">${index + 1}</span>
                ${player.name}
              </div>
            </div>
            <div class="player-stats-details">
              <div class="player-stat">
                <div class="player-stat-value">${player.wins}</div>
                <div class="player-stat-label">Victorias</div>
              </div>
              <div class="player-stat">
                <div class="player-stat-value">${player.totalGames}</div>
                <div class="player-stat-label">Partidas</div>
              </div>
              <div class="player-stat">
                <div class="player-stat-value">${winRate}%</div>
                <div class="player-stat-label">% Victoria</div>
              </div>
              <div class="player-stat">
                <div class="player-stat-value">${avgScore}</div>
                <div class="player-stat-label">Media Pts</div>
              </div>
              <div class="player-stat">
                <div class="player-stat-value">${player.highestScore}</div>
                <div class="player-stat-label">Mayor Punt.</div>
              </div>
            </div>
          </div>
        `;
      });
      
      playersContainer.innerHTML = playersHTML;
      console.log('Estadísticas de jugadores cargadas correctamente');
    })
    .catch(error => {
      console.error('Error al cargar estadísticas:', error);
      document.getElementById('players-loading').style.display = 'none';
      document.getElementById('players-stats-list').innerHTML = `
        <div class="no-data-message">
          <i class="fas fa-exclamation-circle"></i>
          Error al cargar datos: ${error.message}
        </div>
      `;
    });
  
  // Timeout de seguridad
  setTimeout(() => {
    if (document.getElementById('players-loading').style.display === 'flex') {
      console.warn('Timeout de carga de estadísticas alcanzado');
      document.getElementById('players-loading').style.display = 'none';
      document.getElementById('players-stats-list').innerHTML = `
        <div class="no-data-message">
          <i class="fas fa-exclamation-circle"></i>
          Tiempo de espera agotado. Por favor, inténtalo de nuevo.
        </div>
      `;
    }
  }, 10000);
}

// Función para formatear fecha
function formatDate(timestamp) {
  if (!timestamp) return 'Fecha desconocida';
  
  const date = new Date(timestamp);
  return date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Función para mostrar pestañas en la sección de estadísticas
function showStatsTab(tabName) {
  console.log('Mostrando pestaña de estadísticas:', tabName);
  
  // Ocultar todas las pestañas
  document.querySelectorAll('.stats-tab').forEach(tab => {
    tab.classList.add('hidden');
  });
  
  // Desactivar todos los botones de pestañas
  document.querySelectorAll('.stats-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Mostrar la pestaña solicitada
  const tabToShow = document.getElementById(tabName + '-tab');
  if (tabToShow) {
    tabToShow.classList.remove('hidden');
  } else {
    console.error('No se encontró la pestaña:', tabName + '-tab');
  }
  
  // Activar el botón correspondiente
  const buttonToActivate = document.getElementById(tabName + '-tab-btn');
  if (buttonToActivate) {
    buttonToActivate.classList.add('active');
  } else {
    console.error('No se encontró el botón de pestaña:', tabName + '-tab-btn');
  }
  
  // Cargar datos específicos de la pestaña
  if (tabName === 'history') {
    loadGameHistory();
  } else if (tabName === 'players') {
    loadPlayerStats();
  }
}

// Inicializar mostrando la pantalla principal al cargar la página
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM cargado, iniciando aplicación...');
  showScreen('main-menu');
});


// Variables para almacenar el estado actual de juego (para saber a dónde volver)

// Función para mostrar el modal de confirmación de salida
function showExitConfirmation(gameMode) {
  currentGameMode = gameMode;
  document.getElementById('exit-confirm-modal').style.display = 'flex';
}

// Función para confirmar la salida
function confirmExit() {
  document.getElementById('exit-confirm-modal').style.display = 'none';
  
  // Salir según el modo de juego
  if (currentGameMode === 'standard') {
    leaveRoom();
    showScreen('online-menu');
  } else if (currentGameMode === 'dados') {
    leaveDadosRoom();
    showScreen('dados-menu');
  } else if (currentGameMode === 'offline') {
    offlineMode = false;
    showScreen('main-menu');
  }
}

// Función para cancelar la salida
function cancelExit() {
  document.getElementById('exit-confirm-modal').style.display = 'none';
}

// Reemplazar las funciones existentes de salida
function exitGame() {
  showExitConfirmation('standard');
}

function exitDadosGame() {
  showExitConfirmation('dados');
}

// Versión offline
function exitOfflineGame() {
  showExitConfirmation('offline');
}