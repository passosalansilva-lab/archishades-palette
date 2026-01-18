# Configuração de Notificações Nativas no Electron

Este guia explica como configurar as notificações nativas do sistema operacional no seu app Electron do CardpOn.

## Arquivos necessários no projeto Electron

### 1. preload.js

Adicione ou atualize o arquivo `preload.js` com o seguinte código:

```javascript
const { contextBridge, ipcRenderer, Notification } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Native notifications
  showNotification: (options) => {
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.log('Notifications not supported');
      return;
    }
    
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon || './icon.png',
      silent: options.silent || false,
      urgency: options.urgency || 'normal',
    });
    
    notification.show();
    
    // Store tag for click handling
    notification.tag = options.tag;
    
    notification.on('click', () => {
      // Send click event back to renderer
      ipcRenderer.send('notification-clicked', options.tag);
      
      // Focus the window
      ipcRenderer.send('focus-window');
    });
  },
  
  onNotificationClick: (callback) => {
    ipcRenderer.on('notification-click-response', (event, tag) => {
      callback(tag);
    });
  },
});
```

### 2. main.js

Adicione os handlers IPC no arquivo principal do Electron:

```javascript
const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false, // Para usar a title bar customizada
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'icon.png'),
  });

  // Load your app
  mainWindow.loadURL('https://your-app-url.lovable.app');
  // Or for local development:
  // mainWindow.loadFile('index.html');
}

// Window control handlers
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

ipcMain.on('focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Forward notification clicks to renderer
ipcMain.on('notification-clicked', (event, tag) => {
  mainWindow?.webContents.send('notification-click-response', tag);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

## Como funciona

1. **Detecção automática**: O hook `useElectronNotifications` detecta automaticamente se está rodando no Electron
2. **Fallback inteligente**: Se não estiver no Electron, usa a Web Notification API padrão
3. **Integração transparente**: Os hooks existentes (`useOrderNotifications`, `useWaiterCallNotifications`) já foram atualizados para usar notificações nativas

## Testando

1. Compile seu app Electron com as configurações acima
2. Faça login no sistema
3. Quando um novo pedido chegar ou um garçom for chamado, você verá a notificação nativa do sistema operacional

## Notas

- No Windows, as notificações aparecem no Action Center
- No macOS, aparecem no Notification Center
- No Linux, dependem do sistema de notificações da distribuição (libnotify)

## Permissões

O Electron não requer permissão explícita do usuário para mostrar notificações nativas (diferente do navegador), mas é uma boa prática informar o usuário que notificações serão enviadas.
