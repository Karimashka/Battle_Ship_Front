import React, { useState, useEffect } from 'react';
import soundService from './services/soundService';

function GameBoard() {
  // Состояния
  const [gameId, setGameId] = useState(localStorage.getItem('gameId') || '');
  const [playerId, setPlayerId] = useState(localStorage.getItem('playerId') || '');
  const [gameInfo, setGameInfo] = useState(null);
  const [shipCells, setShipCells] = useState(new Set());
  const [myBoard, setMyBoard] = useState(Array(10).fill().map(() => Array(10).fill(null)));
  const [enemyBoard, setEnemyBoard] = useState(Array(10).fill().map(() => Array(10).fill(null)));

  // Сохранение ID в localStorage
  const saveIds = () => {
    localStorage.setItem('gameId', gameId);
    localStorage.setItem('playerId', playerId);
  };

  // Копирование текста
  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Скопировано: " + text);
    }).catch(err => {
      alert("Ошибка копирования: " + err);
    });
  };

  const createGame = async () => {
      // Проверка доступности бэкенда
      if (!navigator.onLine) {
        alert('Ошибка: Нет интернет-соединения');
        return;
      }

      // Проверка URL бэкенда
     const API_URL = '/api/create_game';
     if (!API_URL) {  // Проверяем только на пустоту
        alert('Ошибка: URL API не может быть пустым!');
        return;
     }

      try {
        // Старт загрузки
        setGameInfo(
          <div className="loading-message">
            <div>⌛ Создание игры...</div>
          </div>
        );

        // Запрос к бэкенду
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include' // Для куков, если используется авторизация
        });

        // Проверка HTTP-статуса
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
            `HTTP error! Status: ${response.status}`
          );
        }

        // Парсинг данных
        const data = await response.json();

        // Валидация ответа
        if (!data.game_id || !data.player_id) {
          throw new Error('Сервер вернул неполные данные');
        }

        // Сохранение в state и localStorage
        setGameId(data.game_id);
        setPlayerId(data.player_id);
        localStorage.setItem('gameId', data.game_id);
        localStorage.setItem('playerId', data.player_id);

        // Успешное создание
        setGameInfo(
          <div className="success-message">
            <div>✅ Игра создана!</div>
            <div>
              ID игры:
              <span
                onClick={() => navigator.clipboard.writeText(data.game_id)}
                style={{cursor: 'pointer', color: '#0066cc'}}
              >
                {data.game_id}
              </span>
            </div>
            <button
              onClick={() => alert('Отправьте этот ID второму игроку')}
              style={{marginTop: '10px'}}
            >
              Как пригласить?
            </button>
          </div>
        );

      } catch (error) {
        // Обработка ошибок
        console.error('Ошибка создания игры:', error);

        let errorMessage = 'Неизвестная ошибка';
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Сервер не отвечает. Проверьте:';
          errorMessage += '\n1. Запущен ли бэкенд';
          errorMessage += '\n2. Правильный ли URL';
          errorMessage += '\n3. Настройки CORS';
        } else if (error.message.includes('CORS')) {
          errorMessage = 'Ошибка CORS. Нужно настроить сервер:';
          errorMessage += '\napp.use(cors({origin: true}))';
        }

        setGameInfo(
          <div className="error-message">
            <div>❌ Ошибка создания</div>
            <div style={{whiteSpace: 'pre-line'}}>{errorMessage}</div>
            {error.message && <div>({error.message})</div>}
          </div>
        );
      }
  };



  // Подключение к игре
  const joinGame = async () => {
    const gameId = prompt('Введите ID игры для подключения:');
    if (!gameId) {
      alert('Необходимо ввести ID игры');
      return;
    }

   try {
      const response = await fetch(`/api/join_game?_=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка сервера');
      }

      const data = await response.json();
      setGameId(gameId);
      setPlayerId(data.player_id);
      saveIds();

      setGameInfo(
        <div>
          <div>✅ Успешное подключение</div>
          <div>Game ID: <span onClick={() => copyText(gameId)} style={{color: '#0066cc', cursor: 'pointer'}}>{gameId}</span></div>
          <div>Player ID: <span onClick={() => copyText(data.player_id)} style={{color: '#009933', cursor: 'pointer'}}>{data.player_id}</span></div>
        </div>
      );
    } catch (error) {
      setGameInfo(
        <div style={{color: 'red'}}>
          <div>❌ Ошибка подключения</div>
          <div>{error.message}</div>
        </div>
      );
      localStorage.removeItem('gameId');
      setGameId('');
    }
  };

  // Отправка кораблей
  const sendShips = async () => {
    const ships = groupShips();

    try {
      const res = await fetch(`/api/set_ships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, player_id: playerId, ships }),
      });

      const data = await res.json();
      if (res.ok) {
        alert('Корабли успешно отправлены');
      } else {
        alert('Ошибка: ' + data.detail);
      }
    } catch (err) {
      alert('Ошибка при отправке кораблей: ' + err.message);
    }
  };

      // Выстрел
  const shoot = async (x, y) => {
      try {
        // 1. Валидация входных данных
        if (typeof x !== 'number' || typeof y !== 'number') {
          throw new Error('Координаты должны быть числами');
        }

        if (!gameId || !playerId) {
          throw new Error('Требуются gameId и playerId');
        }

        console.log('Отправка выстрела:', { x, y, gameId, playerId });

        // 2. Отправка запроса
        const response = await fetch(`/api/shoot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            game_id: gameId,
            player_id: playerId,
            x,
            y
          }),
        });

        // 3. Обработка ответа сервера
        if (!response.ok) {
          let errorDetails = '';
          try {
            const errorData = await response.json();
            errorDetails = errorData.message || JSON.stringify(errorData);
          } catch {
            errorDetails = await response.text();
          }

          throw new Error(`Сервер ответил с ошибкой ${response.status}: ${errorDetails || 'Нет деталей'}`);
        }
        // 4. Парсинг ответа
        let data;
        try {
          data = await response.json();
          console.log('Ответ сервера:', data);
        } catch (err) {
          throw new Error('Невалидный JSON в ответе сервера');
        }

        // 5. Валидация структуры ответа
        if (!data || typeof data.result !== 'string') {
          throw new Error('Неверный формат ответа сервера');
        }

        // звук выстрела
        soundService.play('shot');

        // 6. Обновление доски
        setEnemyBoard(prev => {
          const newBoard = prev.map(row => [...row]);

          try {
            if (y >= newBoard.length || x >= newBoard[0]?.length) {
              console.error('Выстрел за пределы доски');
              return prev;
            }

            if (data.result === 'hit') {
              newBoard[y][x] = 'hit';

              if (data.sunk && Array.isArray(data.adjacent)) {
                soundService.play('explosion');
                data.adjacent.forEach(({x: adjX, y: adjY}) => {
                  if (adjY >= 0 && adjY < newBoard.length &&
                      adjX >= 0 && adjX < newBoard[0].length) {
                    if (newBoard[adjY][adjX] !== 'hit') {
                      newBoard[adjY][adjX] = 'miss';
                    }
                  }
                });
              }
            } else {
              newBoard[y][x] = 'miss';
            }
          } catch (err) {
            console.error('Ошибка обновления доски:', err);
            return prev;
          }

          return newBoard;
        });

        // 7. Обработка победы
        if (data.winner) {
          setTimeout(() => {
            alert(`Игра окончена! Победитель: ${data.winner}`);
          }, 100);
        }

      } catch (err) {
        console.error('Полная ошибка выстрела:', {
          message: err.message,
          stack: err.stack,
          coordinates: {x, y},
          gameId,
          playerId,
          timestamp: new Date().toISOString()
        });

        alert(`Ошибка: ${err.message}\nПодробности в консоли`);
      }
  };

  // Группировка кораблей
  const groupShips = () => {
    const coords = Array.from(shipCells).map(s => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    });

    const visited = new Set();
    const ships = [];

    function getKey(x, y) {
      return `${x},${y}`;
    }

    function bfs(start) {
      const queue = [start];
      const group = [];
      visited.add(getKey(start.x, start.y));

      while (queue.length > 0) {
        const current = queue.shift();
        group.push(current);

        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 },
        ];

        for (const neighbor of neighbors) {
          const key = getKey(neighbor.x, neighbor.y);
          if (
            coords.some(c => c.x === neighbor.x && c.y === neighbor.y) &&
            !visited.has(key)
          ) {
            visited.add(key);
            queue.push(neighbor);
          }
        }
      }

      return group;
    }

    for (const coord of coords) {
      const key = getKey(coord.x, coord.y);
      if (!visited.has(key)) {
        const group = bfs(coord);
        ships.push({ coordinates: group });
      }
    }

    return ships;
  };

  // Обработчик клика по своей доске
  const handleMyBoardClick = (x, y) => {
    const key = `${x},${y}`;
    const newShipCells = new Set(shipCells);

    if (newShipCells.has(key)) {
      newShipCells.delete(key);
    } else {
      newShipCells.add(key);
    }

    setShipCells(newShipCells);

    const newBoard = [...myBoard];
    newBoard[y][x] = newShipCells.has(key) ? 'ship' : null;
    setMyBoard(newBoard);
  };

  // Рендер ячейки
  const renderCell = (cell, x, y, isEnemy, onClick) => {
  let className = 'cell';
  if (cell === 'ship') className += ' ship';
  if (cell === 'hit') className += ' hit';
  if (cell === 'miss') className += ' miss';

  return (
    <div
      key={`${x}-${y}`}
      className={className}
      onClick={() => onClick(x, y)}
      title={`${x},${y}`} // Подсказка с координатами
    >
      {cell === 'hit' && '💥'}
      {cell === 'miss' && '•'}
    </div>
  );
};

  return (
    <div className="app">
      <h1>Морской Бой</h1>
      <div className="controls">
        <label>
          Game ID:
          <input
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          />
        </label>
        <label>
          Player ID:
          <input
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          />
        </label>
        <button onClick={saveIds}>Сохранить</button>
      </div>

      <div className="boards">
        <div className="board-container">
          <h3>Моё поле (расстановка)</h3>
          <div className="board">
            {myBoard.map((row, y) => (
              <div key={y} className="row">
                {row.map((cell, x) => renderCell(cell, x, y, false, handleMyBoardClick))}
              </div>
            ))}
          </div>
        </div>

        <div className="board-container">
          <h3>Поле врага (стрельба)</h3>
          <div className="board">
            {enemyBoard.map((row, y) => (
              <div key={y} className="row">
                {row.map((cell, x) => renderCell(cell, x, y, true, shoot))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="actions">
        <button onClick={sendShips}>Готово (Отправить корабли)</button>
        <button onClick={createGame}>Создать игру</button>
        <button onClick={joinGame}>Присоединиться к игре</button>
      </div>

      {gameInfo && <div className="game-info">{gameInfo}</div>}
    </div>
  );
}

export default GameBoard;
