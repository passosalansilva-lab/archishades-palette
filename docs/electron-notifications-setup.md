# Configuração de Notificações Nativas no Electron

Este guia explica como configurar as notificações nativas do sistema operacional no seu app Electron do CardpOn.

## 1. Atualize o main.js

Adicione as seguintes alterações ao seu `main.js`:

### 1.1 Adicione `Notification` no import

```javascript
const { app, BrowserWindow, Menu, ipcMain, shell, nativeImage, Notification } = require('electron')
```

### 1.2 Adicione os handlers de notificação no `setupIpcHandlers()`

```javascript
function setupIpcHandlers() {
  // ... seus handlers existentes ...

  ipcMain.on('window-minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.on('window-close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle('window-is-maximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })

  // ============================================
  // NOVOS HANDLERS PARA NOTIFICAÇÕES
  // ============================================
  
  ipcMain.on('focus-window', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  ipcMain.on('show-notification', (event, options) => {
    if (!Notification.isSupported()) {
      console.log('[Electron] Notifications not supported on this system')
      return
    }

    const iconPath = options.icon || getIconPath()
    
    const notification = new Notification({
      title: options.title || 'Cardápio On',
      body: options.body || '',
      icon: iconPath,
      silent: options.silent || false,
      urgency: options.urgency || 'normal',
    })

    notification.show()

    notification.on('click', () => {
      // Foca a janela principal
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
      
      // Envia evento de clique para o renderer com a tag
      if (options.tag) {
        mainWindow?.webContents.send('notification-clicked', options.tag)
      }
    })
  })
}
```

---

## 2. Atualize o preload.js

Substitua ou atualize seu `preload.js` com este conteúdo:

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================
  // CONTROLES DE JANELA (existentes)
  // ============================================
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // ============================================
  // NOTIFICAÇÕES NATIVAS (novos)
  // ============================================
  showNotification: (options) => {
    ipcRenderer.send('show-notification', {
      title: options.title,
      body: options.body,
      icon: options.icon,
      silent: options.silent || false,
      urgency: options.urgency || 'normal',
      tag: options.tag,
    })
  },

  onNotificationClick: (callback) => {
    // Remove listener anterior para evitar duplicatas
    ipcRenderer.removeAllListeners('notification-clicked')
    ipcRenderer.on('notification-clicked', (event, tag) => {
      callback(tag)
    })
  },

  // Foca a janela principal
  focusWindow: () => ipcRenderer.send('focus-window'),
})

// Log para confirmar que o preload foi carregado
console.log('[Preload] electronAPI exposta com sucesso')
```

---

## 3. Como funciona

1. **Detecção automática**: O app web detecta automaticamente se está rodando no Electron através do `window.electronAPI`
2. **Fallback inteligente**: Se não estiver no Electron, usa a Web Notification API padrão do navegador
3. **Integração transparente**: Os hooks `useOrderNotifications` e `useWaiterCallNotifications` já foram atualizados para usar notificações nativas quando disponíveis

---

## 4. Fluxo de notificação

```
Novo Pedido (Supabase Realtime)
         ↓
useOrderNotifications detecta INSERT
         ↓
showSystemNotification() é chamado
         ↓
  ┌──────────────────────────────────┐
  │  window.electronAPI existe?      │
  │                                  │
  │  SIM → ipcRenderer.send()        │
  │        → main.js recebe          │
  │        → new Notification()      │
  │        → Notificação nativa OS   │
  │                                  │
  │  NÃO → new Notification() (web)  │
  │        → Notificação do browser  │
  └──────────────────────────────────┘
```

---

## 5. Testando

1. Recompile seu app Electron com as alterações
2. Faça login no sistema
3. Peça para alguém fazer um pedido ou simule um
4. Você deve ver a notificação nativa do Windows/macOS/Linux

---

## 6. Notas

- **Windows**: As notificações aparecem no Action Center (canto inferior direito)
- **macOS**: Aparecem no Notification Center
- **Linux**: Dependem do sistema de notificações da distribuição (libnotify)
- O Electron **não precisa de permissão** do usuário para notificações nativas (diferente do browser)

---

## 7. Troubleshooting

### Notificação não aparece
- Verifique se `Notification.isSupported()` retorna `true` no main.js
- No Windows, verifique se as notificações do app não estão silenciadas nas Configurações > Sistema > Notificações

### Som não toca
- O som da notificação é controlado pelo sistema operacional
- Se `silent: true`, o som não tocará
- O app já toca um som próprio via `useNotificationSound`, então a notificação pode ficar `silent: true` para não duplicar
