'use strict'

//import { app, BrowserWindow, BrowserView, ipcMain } from 'electron';
//import Store from 'electron-store';
//const store = new Store();
//import mqtt from 'mqtt';

const { app, BrowserWindow, BrowserView, ipcMain  } = require('electron');
const Store = require('electron-store');
const store = new Store();
const mqtt = require('mqtt');



//import path from 'path';
//import { fileURLToPath } from 'url';
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

const path = require('path');

if (require('electron-squirrel-startup')) app.quit();


const mqttsub = store.get('mqtt.sub') || { broker: "projection-mapping-poc-vm.japaneast.cloudapp.azure.com", port: 1883, topic: "pmrsu/0/stay" }
const mqttpub = store.get('mqtt.pub') || { broker: "projection-mapping-poc-vm.japaneast.cloudapp.azure.com", port: 1883, topic: "pmcnt/0/status", interval: 60, no:0 }

const clientIdSub = `mqtt_${Math.random().toString(16).slice(3)}`
const clientIdPub = `mqtt_${Math.random().toString(16).slice(3)}`

let contMode = 0;
let seqID=0;

const sub = mqtt.connect(`mqtt://${mqttsub.broker}:${mqttsub.port}`, {
  clientIdSub,
  clean: true,
  connectTimeout: 4000, 
  reconnectPeriod: 1000,  
})

const pub = mqtt.connect(`mqtt://${mqttpub.broker}:${mqttpub.port}`, {
  clientIdPub,
  clean: true,
  connectTimeout: 4000, 
  reconnectPeriod: 1000,  
})


sub.on('connect', () => {
  console.log('Sub Connected')
  sub.subscribe([mqttsub.topic], () => {
    console.log(`Subscribe to topic '${mqttsub.topic}'`)
  })
})
sub.on('message', (topic, message) => {
  console.log('Received Message:', topic, message.toString()) 
  const data = JSON.parse(message);
  console.log(data)
  if(data.contMode != contMode) {
    contMode = data.contMode;
    if(win){
      if(contMode == 0 || contMode == 1){
        win.loadURL('file://' + path.resolve(__dirname + `/public_html/${contMode}.html`));
      }
    }
  }
})

let pubConnected = false;
pub.on('connect', () => {
  console.log('Pub Connected')
  pubConnected = true;
})

setInterval(() => {
  if(pubConnected){
    const now = new Date();
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
    

    pub.publish(mqttpub.topic, JSON.stringify({
      sendDateTime:now.toLocaleString('ja-JP', options),
      seqID: seqID,
      pcuID: mqttpub.no,
      playNo: contMode,
      playStatus: 1,
    }))
    seqID++;
    if(seqID>9999) seqID=0;
  }
}, mqttpub.interval * 1000) 


let win;
const createWindow = async () => {
  const zoom = store.get('window.zoom') || 1.0
  const dev = store.get('window.dev') ||  false
  win = new BrowserWindow({
    frame: false,
    title: 'MQTT',
    width: 100,
    height: 100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      zoomFactor: zoom,
    },
  })
  if(dev){
    win.webContents.openDevTools()
  }

  const pos = store.get('window.pos') || { x: 0, y: 0 }
  const size = store.get('window.size') || { width: 1920, height: 1200 }


  win.setPosition( pos.x,  pos.y );
  win.setSize( size.width,  size.height );
  win.setResizable(false);

  //win.loadFile('public/index.html')
  const appfile = path.resolve(__dirname + '/public_html/0.html');
  //console.log(appfile);
  win.loadURL('file://' + appfile);

  // X-Frame-Options 回避
  win.webContents.session.webRequest.onHeadersReceived({ urls: [ "*://*/*" ] },
    (d, c)=>{
      if(d.responseHeaders['X-Frame-Options']){
        delete d.responseHeaders['X-Frame-Options'];
      } else if(d.responseHeaders['x-frame-options']) {
        delete d.responseHeaders['x-frame-options'];
      }

      c({cancel: false, responseHeaders: d.responseHeaders});
    }
  );

  win.on('close', () => {
    // electron-storeで設定からウィンド位置の書き出し
    store.set('window.pos', { x: win.getPosition()[0], y: win.getPosition()[1] })
    store.set('window.size', { width: win.getSize()[0], height: win.getSize()[1] })
    store.set('mqtt.sub', mqttsub)
    store.set('mqtt.pub', mqttpub)
  })

}


app.whenReady().then(async() => {
  await createWindow()

  app.on('activate', async() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    sub.end()
    pub.end()
  }
})

