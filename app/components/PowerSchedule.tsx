'use client';

import { useEffect, useState, useRef } from 'react';

// ===== Інтерфейси =====
interface TimeSlot {
  start: string;
  end: string;
  queues: number;
}

interface QueueSchedule {
  queue: number;
  subqueue: number;
  hours: string[];
}

interface ScheduleData {
  date: string;
  description: string;
  timeSlots: TimeSlot[];
  queueSchedules: QueueSchedule[];
}

export default function PowerSchedule() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [notificationStatus, setNotificationStatus] = useState<'default' | 'granted' | 'denied'>('default');
  const [nextUpdateIn, setNextUpdateIn] = useState<number>(600); // 10 хвилин в секундах
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // ===== Парсинг HTML від POE =====
  const parseScheduleData = (html: string): ScheduleData => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Дата - шукаємо паттерн "DD місяць YYYY року"
      const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4}\s+року)/);
      const date = dateMatch ? dateMatch[1] : '';

      // Опис - текст з .gpvinfodetail без вкладених div
      const gpvinfodetail = doc.querySelector('.gpvinfodetail');
      let description = '';
      if (gpvinfodetail) {
        const clone = gpvinfodetail.cloneNode(true) as HTMLElement;
        const divs = clone.querySelectorAll('div');
        divs.forEach(div => div.remove());
        description = clone.textContent?.trim() || '';
      }

      // Часові проміжки - "з HH:MM по HH:MM в обсязі X черг"
      const timeSlots: TimeSlot[] = [];
      const timeSlotRegex = /з\s+(\d{2}:\d{2})\s+по\s+(\d{2}:\d{2})[\s\S]*?в обсязі\s+<b>([\d.]+)<\/b>/g;
      let match;
      while ((match = timeSlotRegex.exec(html)) !== null) {
        timeSlots.push({
          start: match[1],
          end: match[2],
          queues: parseFloat(match[3]),
        });
      }

      // Графік відключень - таблиця з чергами
      const queueSchedules: QueueSchedule[] = [];
      const rows = doc.querySelectorAll('tbody tr');

      rows.forEach((row, rowIdx) => {
        const queueEl = row.querySelector('.turnoff-scheduleui-table-queue');
        const subqueueEl = row.querySelector('.turnoff-scheduleui-table-subqueue');
        
        const queueText = queueEl?.textContent?.trim() || '';
        const subqueueText = subqueueEl?.textContent?.trim() || '';

        if (queueText || subqueueText) {
          const queue = queueText !== '' 
            ? parseInt(queueText) 
            : queueSchedules[queueSchedules.length - 1]?.queue || 0;
          const subqueue = subqueueText ? parseInt(subqueueText) : 0;

          const hours: string[] = [];
          const cells = row.querySelectorAll('td');
          
          console.log(`\n🔍 Черга ${queue}.${subqueue} - всього клітинок: ${cells.length}`);
          
          cells.forEach((cell, cellIdx) => {
            const className = cell.className || '';
            if (className.includes('light_')) {
              const hourNum = Math.floor(cellIdx / 2);
              const halfNum = cellIdx % 2;
              console.log(`  Клітинка ${cellIdx}: ${className} (година ${hourNum}:${halfNum === 0 ? '00' : '30'})`);
              hours.push(className);
            }
          });

          if (hours.length > 0) {
            console.log(`✅ Черга ${queue}.${subqueue}: ${hours.length} клітинок збережено`);
            if (hours.length !== 48) {
              console.warn(`⚠️ Очікувалось 48 клітинок, а отримано ${hours.length}!`);
            }
            queueSchedules.push({ queue, subqueue, hours });
          }
        }
      });

      console.log('✅ Парсинг успішний:', {
        date,
        description: description.substring(0, 50) + '...',
        timeSlots: timeSlots.length,
        queues: queueSchedules.length,
      });

      return {
        date,
        description,
        timeSlots,
        queueSchedules,
      };
    } catch (err) {
      console.error('❌ Помилка парсингу HTML:', err);
      throw new Error('Не вдалося розпарсити дані графіка');
    }
  };

  // ===== Звук сповіщення =====
  const playNotificationSound = () => {
    try {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (err) {
      console.error('Помилка при відтворенні звуку:', err);
    }
  };

  // ===== Завантаження графіка =====
  const fetchSchedule = async (isInitialLoad = false) => {
    try {
      setLoading(true);
      console.log('🔄 Завантаження графіка з poe.pl.ua...');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('https://www.poe.pl.ua/customs/dynamicgpv-info.php', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP помилка! статус: ${response.status}`);
      }

      const html = await response.text();
      console.log('📦 HTML завантажено, розмір:', html.length);

      if (!html || html.length < 1000) {
        throw new Error('Порожня або некоректна відповідь від сервера');
      }

      const data = parseScheduleData(html);

      // Завантажуємо попередній графік з localStorage
      let previousSchedule: ScheduleData | null = null;
      try {
        const stored = localStorage.getItem('powerSchedule');
        if (stored) {
          previousSchedule = JSON.parse(stored);
          console.log('📂 Завантажено попередній графік з localStorage');
        }
      } catch (err) {
        console.error('Помилка читання localStorage:', err);
      }

      // Перевіряємо чи змінився графік (тільки якщо це НЕ перше завантаження при старті)
      let scheduleChanged = false;
      if (previousSchedule && !isInitialLoad) {
        const oldScheduleStr = JSON.stringify(previousSchedule.queueSchedules);
        const newScheduleStr = JSON.stringify(data.queueSchedules);

        if (oldScheduleStr !== newScheduleStr) {
          scheduleChanged = true;
          console.log('🔔 Графік змінився! Відправляємо сповіщення...');

          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              playNotificationSound();

              const notification = new Notification('⚡ Графік відключень змінився!', {
                body: `Оновлено: ${data.date}\nПеревірте новий графік відключень електроенергії`,
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
                tag: 'schedule-update',
                requireInteraction: true,
              } as NotificationOptions);

              // Закрити сповіщення через 10 секунд
              setTimeout(() => notification.close(), 10000);
            } catch (notifErr) {
              console.error('Помилка при відправці сповіщення:', notifErr);
            }
          } else {
            console.log('⚠️ Сповіщення не увімкнені, але графік змінився!');
          }
        } else {
          console.log('✅ Графік не змінився');
        }
      } else if (isInitialLoad) {
        console.log('📌 Перше завантаження при старті - пропускаємо перевірку на зміни');
      } else {
        console.log('📌 Перше завантаження графіка - збереження в localStorage');
      }

      // Зберігаємо новий графік в localStorage
      try {
        localStorage.setItem('powerSchedule', JSON.stringify(data));
        localStorage.setItem('powerScheduleLastUpdate', new Date().toISOString());
        console.log('💾 Графік збережено в localStorage');
      } catch (err) {
        console.error('Помилка запису в localStorage:', err);
      }

      setSchedule(data);
      setLastUpdate(new Date());
      setNextUpdateIn(600); // Скидаємо таймер на 10 хвилин
      setError(null);

      console.log('✅ Графік успішно оновлено');
    } catch (err) {
      console.error('❌ Помилка при завантаженні:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  // ===== Автооновлення кожні 10 хвилин =====
  useEffect(() => {
    // Спроба завантажити збережений графік при старті
    const loadSavedSchedule = () => {
      try {
        const stored = localStorage.getItem('powerSchedule');
        const lastUpdate = localStorage.getItem('powerScheduleLastUpdate');
        
        if (stored) {
          const savedSchedule = JSON.parse(stored);
          setSchedule(savedSchedule);
          console.log('📂 Завантажено збережений графік з localStorage');
          
          if (lastUpdate) {
            const lastUpdateDate = new Date(lastUpdate);
            setLastUpdate(lastUpdateDate);
            console.log('🕐 Останнє оновлення було:', lastUpdateDate.toLocaleString('uk-UA'));
          }
        }
      } catch (err) {
        console.error('Помилка завантаження збереженого графіка:', err);
      }
    };

    // Завантажуємо збережений графік перед першим запитом
    loadSavedSchedule();

    // Перше завантаження з сервера (з прапорцем isInitialLoad)
    fetchSchedule(true);

    // Інтервал оновлення кожні 10 хвилин
    intervalRef.current = setInterval(() => {
      console.log('⏰ Автооновлення графіка (10 хвилин минуло)');
      fetchSchedule(false);
    }, 10 * 60 * 1000);

    // Зворотний відлік до наступного оновлення
    countdownRef.current = setInterval(() => {
      setNextUpdateIn(prev => {
        if (prev <= 1) return 600; // Скидаємо на 10 хв
        return prev - 1;
      });
    }, 1000);

    // Перевірка статусу сповіщень
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission as 'default' | 'granted' | 'denied');
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ===== Запит дозволу на сповіщення =====
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('❌ Ваш браузер не підтримує сповіщення');
      return;
    }

    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        setNotificationStatus(permission as 'default' | 'granted' | 'denied');

        if (permission === 'granted') {
          playNotificationSound();
          new Notification('✅ Сповіщення увімкнені!', {
            body: 'Тепер ви отримуватимете повідомлення про зміни графіка',
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
          } as NotificationOptions);
        } else if (permission === 'denied') {
          alert('❌ Сповіщення заблоковані. Дозвольте їх у налаштуваннях браузера.');
        }
      } catch (err) {
        console.error('Помилка при запиті дозволу:', err);
        alert('❌ Помилка при запиті дозволу на сповіщення');
      }
    } else if (Notification.permission === 'granted') {
      alert('✅ Сповіщення вже увімкнені!');
    }
  };

  // ===== Тестове сповіщення =====
  const testNotification = async () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        playNotificationSound();
        const notification = new Notification('🧪 Тестове сповіщення', {
          body: 'Якщо ви бачите це повідомлення - все працює правильно!',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
        } as NotificationOptions);

        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200]);
        }

        setTimeout(() => notification.close(), 5000);
      } catch (err) {
        console.error('Помилка при відправці тестового сповіщення:', err);
      }
    } else {
      alert('⚠️ Спочатку увімкніть сповіщення');
    }
  };

  // ===== Допоміжні функції =====
  const getStatusColor = (className: string) => {
    if (className.includes('light_1')) return 'bg-green-600';
    if (className.includes('light_2')) return 'bg-red-600';
    if (className.includes('light_3')) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const getStatusText = (className: string) => {
    if (className.includes('light_1')) return 'Світло';
    if (className.includes('light_2')) return 'Відключено';
    if (className.includes('light_3')) return 'Можливе відключення';
    return '';
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const currentHour = new Date().getHours();

  // ===== Рендеринг =====
  if (loading && !schedule) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">⏳ Завантаження графіка...</div>
      </div>
    );
  }

  if (!schedule) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 px-2 sm:px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Заголовок */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-gray-800 text-center sm:text-left">
            ⚡ Графік відключень електроенергії
          </h1>

          {/* Попередження про помилку */}
          {error && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 sm:p-4 rounded-lg shadow-md mb-3">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ Помилка: {error}
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Спроба повторного завантаження через {formatTime(nextUpdateIn)}
              </p>
            </div>
          )}

          {/* Дата та опис */}
          <div className="bg-white border-l-4 border-blue-500 p-3 sm:p-4 rounded-lg shadow-md mb-3 sm:mb-4">
            <p className="text-base sm:text-lg font-semibold text-gray-800 mb-2">{schedule.date}</p>
            <p className="text-sm sm:text-base text-gray-600 whitespace-pre-wrap">{schedule.description}</p>
          </div>

          {/* Кнопки управління */}
          <div className="flex gap-2 sm:gap-4 mb-3 sm:mb-4 flex-col sm:flex-row">
            <button
              onClick={requestNotificationPermission}
              type="button"
              className={`${
                notificationStatus === 'granted'
                  ? 'bg-green-600 hover:bg-green-700 active:bg-green-800'
                  : notificationStatus === 'denied'
                  ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              } text-white px-4 py-3 sm:py-2 rounded-lg transition shadow-md font-medium text-sm sm:text-base cursor-pointer touch-manipulation active:scale-95`}
            >
              {notificationStatus === 'granted'
                ? '✅ Сповіщення увімкнені'
                : notificationStatus === 'denied'
                ? '❌ Сповіщення заблоковані'
                : '🔔 Увімкнути сповіщення'}
            </button>
            <button
              onClick={() => fetchSchedule(false)}
              type="button"
              disabled={loading}
              className={`${
                loading ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
              } text-white px-4 py-3 sm:py-2 rounded-lg transition shadow-md font-medium text-sm sm:text-base cursor-pointer touch-manipulation active:scale-95 disabled:cursor-not-allowed`}
            >
              {loading ? '⏳ Оновлення...' : '🔄 Оновити зараз'}
            </button>
          </div>

          {/* Час останнього оновлення */}
          <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left bg-white px-3 py-2 rounded-lg shadow-sm">
            <span className="font-medium">Останнє оновлення:</span> {lastUpdate.toLocaleTimeString('uk-UA')}
            <span className="mx-2">•</span>
            <span className="font-medium">Наступне через:</span> {formatTime(nextUpdateIn)}
          </div>
        </div>

        {/* Часові проміжки */}
        {schedule.timeSlots.length > 0 && (
          <div className="mb-4 sm:mb-6 bg-white p-3 sm:p-4 rounded-lg shadow-md">
            <h2 className="text-lg sm:text-xl font-bold mb-3 text-gray-800 flex items-center gap-2">
              <span className="text-2xl">📊</span> Обсяг відключень
            </h2>
            <div className="space-y-2">
              {schedule.timeSlots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2 sm:gap-3 bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-200">
                  <span className="font-mono font-bold text-sm sm:text-base min-w-[100px] sm:min-w-[120px] text-gray-700">
                    {slot.start} - {slot.end}
                  </span>
                  <span className="bg-orange-500 text-white px-2 sm:px-3 py-1 rounded-lg font-semibold text-xs sm:text-sm shadow-sm">
                    {slot.queues} {slot.queues === 1 ? 'черга' : slot.queues < 2 ? 'черги' : 'черг'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Легенда */}
        <div className="mb-4 bg-white p-3 sm:p-4 rounded-lg shadow-md">
          <h3 className="text-base sm:text-lg font-bold mb-3 text-gray-800">Позначення:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 bg-green-50 p-2 sm:p-3 rounded-lg border-2 border-green-600">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-600 rounded shadow-md"></div>
              <span className="font-semibold text-sm sm:text-base text-gray-800">Світло</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 bg-red-50 p-2 sm:p-3 rounded-lg border-2 border-red-600">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-600 rounded shadow-md"></div>
              <span className="font-semibold text-sm sm:text-base text-gray-800">Відключено</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 bg-yellow-50 p-2 sm:p-3 rounded-lg border-2 border-yellow-500">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-500 rounded shadow-md"></div>
              <span className="font-semibold text-sm sm:text-base text-gray-800">Можливе відключення</span>
            </div>
          </div>
        </div>

        {/* Графік по чергах */}
        <div className="bg-white p-2 sm:p-4 rounded-lg shadow-md">
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800 flex items-center gap-2 px-2">
            <span className="text-2xl">📅</span> Графік по чергах
          </h2>

          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <div className="min-w-[800px] px-2">
              {/* Рядок з годинами */}
              <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border-2 border-blue-300 shadow-sm">
                <div className="font-bold text-sm sm:text-base mb-2 text-gray-800 text-center">
                  ⏰ Години доби
                </div>
                <div className="grid grid-cols-24 gap-0.5 sm:gap-1">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const isCurrentHour = hour === currentHour;
                    const nextHour = (hour + 1) % 24;
                    return (
                      <div
                        key={hour}
                        className={`text-center flex flex-col p-1 sm:p-2 rounded font-bold text-[10px] sm:text-xs ${
                          isCurrentHour
                            ? 'bg-blue-600 text-white shadow-md scale-105'
                            : 'bg-white text-gray-700 border border-gray-300'
                        } transition-transform`}
                      >
                        {hour.toString().padStart(2, '0')}<span>-</span>{nextHour.toString().padStart(2, '0')}
                      </div>
                    );
                  })}
                </div>
              </div>

              {schedule.queueSchedules.map((qs, qsIndex) => (
                <div key={qsIndex} className="mb-4 sm:mb-6 bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-200">
                  <div className="font-bold text-base sm:text-lg mb-2 sm:mb-3 text-gray-800 bg-white px-3 py-2 rounded-lg shadow-sm border-l-4 border-blue-500">
                    Черга {qs.queue}.{qs.subqueue}
                  </div>

                  {/* Рядок з годинами для кожної черги */}
                  <div className="mb-2 bg-gradient-to-r from-blue-50 to-indigo-50 p-2 rounded-lg border border-blue-200">
                    <div className="grid grid-cols-24 gap-0.5 sm:gap-1">
                      {Array.from({ length: 24 }, (_, hour) => {
                        const isCurrentHour = hour === currentHour;
                        const nextHour = (hour + 1) % 24;
                        return (
                          <div
                            key={hour}
                            className={`text-center flex flex-col p-1 rounded font-bold text-[9px] sm:text-[10px] ${
                              isCurrentHour
                                ? 'bg-blue-600 text-white shadow-md scale-105'
                                : 'bg-white text-gray-700 border border-gray-300'
                            } transition-transform`}
                          >
                            {hour.toString().padStart(2, '0')}<span className="text-[8px]">-</span>{nextHour.toString().padStart(2, '0')}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-24 gap-0.5 sm:gap-1">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const isCurrentHour = hour === currentHour;
                      return (
                        <div key={hour} className="space-y-0.5 sm:space-y-1">
                          <div className="flex flex-col gap-0.5 sm:gap-1">
                            {[0, 1].map((halfHour) => {
                              const idx = hour * 2 + halfHour;
                              const className = qs.hours[idx] || '';
                              
                              const startHour = hour;
                              const startMin = halfHour * 30;
                              
                              const endMin = (halfHour + 1) * 30;
                              const endHour = endMin >= 60 ? hour + 1 : hour;
                              const endMinDisplay = endMin >= 60 ? 0 : endMin;
                              
                              const time = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}-${endHour.toString().padStart(2, '0')}:${endMinDisplay.toString().padStart(2, '0')}`;
                              
                              return (
                                <div
                                  key={halfHour}
                                  className={`w-full h-6 sm:h-8 rounded ${getStatusColor(className)} ${
                                    isCurrentHour ? 'ring-2 ring-blue-500' : ''
                                  } hover:scale-110 transition-transform cursor-pointer shadow-sm`}
                                  title={`${time} - ${getStatusText(className)}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs sm:text-sm text-gray-600 text-center bg-blue-50 p-2 sm:p-3 rounded-lg">
            💡 Підказка: Наведіть на квадратик, щоб побачити час і статус. Поточна година виділена синім.
          </div>
        </div>

        {/* Тестова кнопка */}
        <div className={`mt-4 sm:mt-6 bg-white p-3 sm:p-4 rounded-lg shadow-md border-2 ${
          notificationStatus === 'granted' ? 'border-green-300' : 'border-purple-200'
        }`}>
          <h3 className="text-base sm:text-lg font-bold mb-2 text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🧪</span> Перевірка сповіщень
          </h3>

          {notificationStatus === 'granted' ? (
            <>
              <p className="text-xs sm:text-sm text-gray-600 mb-3">
                ✅ Сповіщення увімкнені! Натисніть кнопку для тесту:
              </p>
              <button
                onClick={testNotification}
                type="button"
                className="w-full bg-purple-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-purple-700 active:bg-purple-800 transition shadow-md font-medium text-sm sm:text-base cursor-pointer touch-manipulation active:scale-95"
              >
                🔔 Надіслати тестове сповіщення
              </button>
            </>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-gray-600 mb-3">
                ⚠️ Спочатку увімкніть сповіщення кнопкою вгорі
              </p>
              <button
                type="button"
                className="w-full bg-gray-400 text-white px-4 py-3 sm:py-2 rounded-lg cursor-not-allowed shadow-md font-medium text-sm sm:text-base"
                disabled
              >
                🔔 Спочатку увімкніть сповіщення ↑
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}