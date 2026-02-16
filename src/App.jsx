import React, { useState } from 'react';
import {
  Youtube,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Layers,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

function App() {
  const [bulkText, setBulkText] = useState('');
  const [items, setItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState('mp3');
  const [defaultQuality, setDefaultQuality] = useState('320kbps');

  const extractLinks = (text) => {
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    const matches = [...text.matchAll(youtubeRegex)];
    // Filtra duplicados
    return [...new Set(matches.map(match => `https://www.youtube.com/watch?v=${match[1]}`))];
  };

  const handleStartProcess = async () => {
    const urls = extractLinks(bulkText);
    if (urls.length === 0) return;

    setIsProcessing(true);
    const newItems = urls.map(url => ({
      id: Math.random().toString(36).substr(2, 9),
      url,
      status: 'processing',
      format: defaultFormat,
      quality: defaultQuality,
      info: null,
      progress: 20
    }));

    setItems(prev => [...prev, ...newItems]);
    setBulkText('');

    // Inicia a obtenção de informações individualmente
    urls.forEach(async (url, index) => {
      const newItem = newItems[index];
      await fetchInfo(newItem.id, url);
    });

    setIsProcessing(false);
  };

  const fetchInfo = async (id, url) => {
    try {
      const response = await fetch(`http://localhost:4001/info?url=${encodeURIComponent(url)}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      updateItem(id, { info: data, status: 'completed', progress: 100 });
    } catch {
      updateItem(id, { status: 'error' });
    }
  };

  const updateItem = (id, updates) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const triggerDownload = (item) => {
    const downloadUrl = `http://localhost:4001/download?url=${encodeURIComponent(item.url)}&format=${item.format}`;

    // Cria um iframe invisível para forçar o download sem abrir nova aba visível
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    // Remove o iframe após um tempo seguro (o download já deve ter iniciado)
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 60000); // 60 segundos para garantir que a requisição foi feita
  };

  const downloadAll = () => {
    const completedItems = items.filter(i => i.status === 'completed');
    if (completedItems.length === 0) {
      alert('Nenhum item pronto para download.');
      return;
    }

    // Inicia download em cascata com intervalo de 2.5s
    completedItems.forEach((item, index) => {
      setTimeout(() => {
        triggerDownload(item);
      }, index * 2500);
    });
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="app-container">
      <nav className="navbar glass">
        <div className="container nav-content">
          <div className="logo">
            <Youtube size={32} color="#f43f5e" />
            <span className="brand-name">AlfaFormatura <span>YT Converter</span></span>
          </div>
        </div>
      </nav>

      <main className="container main-content">
        <section className="converter-section">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hero-text">
            <h1>O Conversor de YouTube para <span>Grandes Eventos</span></h1>
            <p>Cole os links e baixe tudo de uma vez.</p>
          </motion.div>

          <div className="bulk-input-container glass">
            <div className="input-header">
              <div className="title-with-icon">
                <FileText size={20} className="primary" />
                <h3>Links do YouTube</h3>
              </div>
              <div className="global-settings">
                <select value={defaultFormat} onChange={(e) => setDefaultFormat(e.target.value)}>
                  <option value="mp3">Somente Áudio (MP3)</option>
                  <option value="mp4">Vídeo + Áudio (MP4)</option>
                </select>
              </div>
            </div>

            <textarea
              placeholder="Cole os links aqui..."
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />

            <button className="process-all-btn glow-primary" onClick={handleStartProcess} disabled={!bulkText.trim() || isProcessing}>
              {isProcessing ? <Loader2 className="spinner" /> : <><Layers size={20} /> Iniciar Processamento</>}
            </button>
          </div>

          {/* Cabeçalho da Lista + Botão Baixar Todos */}
          <AnimatePresence>
            {items.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="results-header">
                <h2>Lista de Downloads ({items.length})</h2>
                {items.some(i => i.status === 'completed') && (
                  <button className="download-all-btn" onClick={downloadAll}>
                    <Download size={18} /> Baixar Todos ({items.filter(i => i.status === 'completed').length})
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="results-list">
            <AnimatePresence mode='popLayout'>
              {items.map((item) => (
                <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className={`item-row glass ${item.status}`}>
                  <div className="item-info">
                    {item.status === 'processing' ? <Loader2 className="spinner primary" /> : item.status === 'completed' ? <CheckCircle2 color="#22c55e" /> : <AlertCircle color="#f43f5e" />}
                    <div className="text-details">
                      <span className="item-title">{item.info ? item.info.title : "Carregando..."}</span>
                      <span className="item-author">{item.info ? `${item.info.author} • ${item.format.toUpperCase()}` : item.url}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    {item.status === 'completed' && (
                      <button className="download-btn-mini" onClick={() => triggerDownload(item)}>
                        <Download size={16} /> Baixar
                      </button>
                    )}
                    <button className="delete-btn" onClick={() => removeItem(item.id)}><Trash2 size={16} /></button>
                  </div>
                  {item.status === 'processing' && <div className="item-progress"><div className="fill" style={{ width: `${item.progress}%` }}></div></div>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      </main>

      <footer className="glass">
        <div className="container center">
          <p>&copy; 2025 AlfaFormatura YT Converter</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
