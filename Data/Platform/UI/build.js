(function () {
  'use strict';

  var MAX_MESSAGE_LENGTH = 300;
  var MAX_RENDERED_MESSAGES = 80;
  var HISTORY_LIMIT = 30;

  var root = null;
  var log = null;
  var form = null;
  var input = null;
  var commandHistory = [];
  var commandHistoryIndex = 0;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function getElements() {
    root = document.getElementById('skymp-chat');
    log = document.getElementById('chat-log');
    form = document.getElementById('chat-form');
    input = document.getElementById('chat-input');
    return root && log && form && input;
  }

  function createWidgetStore() {
    var value = [];
    var listeners = [];

    return {
      get: function () {
        return value.slice();
      },
      set: function (next) {
        value = Array.isArray(next) ? next.slice() : [];
        listeners.slice().forEach(function (listener) {
          try {
            listener(value.slice());
          } catch (err) {
            console.error('[skymp5-chat] widget listener failed', err);
          }
        });
      },
      subscribe: function (listener) {
        if (typeof listener !== 'function') return function () {};
        listeners.push(listener);
        return function () {
          listeners = listeners.filter(function (item) {
            return item !== listener;
          });
        };
      },
    };
  }

  function ensureCompatGlobals() {
    window.skyrimPlatform = window.skyrimPlatform || {};
    window.skyrimPlatform.widgets = window.skyrimPlatform.widgets || createWidgetStore();
    window.chatMessages = window.chatMessages || [];

    window.playSound = window.playSound || function () {};
    window.scrollToLastMessage = scrollToLastMessage;
  }

  function parseColorMessage(raw) {
    var message = String(raw || '');
    var parts = [];
    var color = '#fafafa';
    var cursor = 0;
    var pattern = /#\{([0-9a-fA-F]{6})\}/g;
    var match = null;

    while ((match = pattern.exec(message)) !== null) {
      if (match.index > cursor) {
        parts.push({ text: message.slice(cursor, match.index), color: color });
      }
      color = '#' + match[1];
      cursor = pattern.lastIndex;
    }

    if (cursor < message.length) {
      parts.push({ text: message.slice(cursor), color: color });
    }

    return parts.length ? parts : [{ text: message, color: color }];
  }

  function addMessage(raw) {
    if (!log && !getElements()) return;

    var message = String(raw || '');
    if (!message) return;

    var line = document.createElement('div');
    line.className = 'chat-line';

    parseColorMessage(message).forEach(function (part) {
      if (!part.text) return;
      var span = document.createElement('span');
      span.style.color = part.color;
      span.textContent = part.text;
      line.appendChild(span);
    });

    if (!line.childNodes.length) return;
    log.appendChild(line);

    while (log.childNodes.length > MAX_RENDERED_MESSAGES) {
      log.removeChild(log.firstChild);
    }

    window.chatMessages.push(message);
    while (window.chatMessages.length > MAX_RENDERED_MESSAGES) {
      window.chatMessages.shift();
    }

    scrollToLastMessage();
  }

  function scrollToLastMessage() {
    if (log) log.scrollTop = log.scrollHeight;
  }

  function openChat(seed) {
    if (!root && !getElements()) return;

    root.classList.add('is-open');
    input.value = seed || '';
    window.setTimeout(function () {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }

  function closeChat() {
    if (!root && !getElements()) return;

    input.value = '';
    input.blur();
    root.classList.remove('is-open');
    commandHistoryIndex = commandHistory.length;
  }

  function rememberInput(text) {
    if (!text) return;
    if (commandHistory[commandHistory.length - 1] !== text) {
      commandHistory.push(text);
      while (commandHistory.length > HISTORY_LIMIT) commandHistory.shift();
    }
    commandHistoryIndex = commandHistory.length;
  }

  function sendToServer(text) {
    if (window.mp && typeof window.mp.send === 'function') {
      window.mp.send('cef::chat:send', text);
      return true;
    }

    console.error('[skymp5-chat] window.mp.send is not available');
    addMessage('#{ff9933}[Chat] #{ffffff}Not connected to the SkyMP browser bridge.');
    return false;
  }

  function submitChat() {
    if (!input) return;

    var text = String(input.value || '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (text) {
      rememberInput(text);
      sendToServer(text);
    }
    closeChat();
  }

  function isTypingTarget(target) {
    return target && (
      target === input ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );
  }

  function moveHistory(delta) {
    if (!commandHistory.length) return;
    commandHistoryIndex = Math.max(0, Math.min(commandHistory.length, commandHistoryIndex + delta));
    input.value = commandHistory[commandHistoryIndex] || '';
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function bindEvents() {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopPropagation();
      submitChat();
    });

    input.addEventListener('keydown', function (event) {
      event.stopPropagation();

      if (event.key === 'Escape') {
        event.preventDefault();
        closeChat();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveHistory(-1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveHistory(1);
      }
    }, true);

    input.addEventListener('click', function (event) {
      event.stopPropagation();
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;

      if (event.key === 'Enter' || event.key === '/') {
        event.preventDefault();
        event.stopPropagation();
        openChat(event.key === '/' ? '/' : '');
      }
    }, true);
  }

  function signalLoaded() {
    if (window.skyrimPlatform && typeof window.skyrimPlatform.sendMessage === 'function') {
      window.skyrimPlatform.sendMessage('front-loaded');
    }
  }

  function init() {
    if (!getElements()) {
      console.error('[skymp5-chat] chat DOM is missing');
      return;
    }

    ensureCompatGlobals();

    window.skympChat = window.skympChat || {};
    window.skympChat.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
    window.skympChat.addMessage = addMessage;
    window.skympChat.open = openChat;
    window.skympChat.close = closeChat;
    window.skympChat.send = function (text) {
      var value = String(text || '').trim().slice(0, MAX_MESSAGE_LENGTH);
      if (value) sendToServer(value);
    };

    bindEvents();
    signalLoaded();
  }

  ready(init);
})();
