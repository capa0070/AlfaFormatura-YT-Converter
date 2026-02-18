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

  // URL da API: Usa variável de ambiente em produção ou fallback para localhost
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001';

  // Função para processar a entrada de texto e identificar Links e Playlists
  const handleStartProcess = async () => {
    if (!bulkText.trim()) return;

    setIsProcessing(true);

    // Divide por quebra de linha ou vírgula para processar múltiplas entradas
    const inputs = bulkText.split(/[\n,;]+/).map(u => u.trim()).filter(u => u);

    // Limpa input
    setBulkText('');

    for (const input of inputs) {
      if (input.includes('list=')) {
        // É UMA PLAYLIST
        try {
          // Cria um placeholder visual para a playlist enquanto carrega
          const playlistId = Math.random().toString(36).substr(2, 9);
          setItems(prev => [{
            id: playlistId,
            url: input,
            status: 'processing',
            info: { title: 'Carregando Playlist...', author: 'Aguarde' },
            format: defaultFormat
          }, ...prev]);

          // Busca os vídeos da playlist no backend
          const res = await fetch(`${API_URL}/playlist?url=${encodeURIComponent(input)}`);
          const data = await res.json();

          // Remove o placeholder da playlist
          setItems(prev => prev.filter(i => i.id !== playlistId));

          if (data.videos) {
            // Adiciona cada vídeo da playlist à lista principal
            data.videos.forEach(video => {
              const newItem = {
                id: Math.random().toString(36).substr(2, 9),
                url: video.url,
                status: 'processing', // Vai buscar info detalhada depois
                format: defaultFormat,
                quality: defaultQuality,
                info: null,
                progress: 0
              };

              // Adiciona na UI
              setItems(prev => [newItem, ...prev]);

              // Dispara busca de detalhes (tamanho, res real) para este vídeo
              fetchInfo(newItem.id, newItem.url);
            });
          }

        } catch (error) {
          console.error('Erro ao processar playlist:', error);
          // Remove o placeholder da playlist em caso de erro para não travar a UI
          setItems(prev => prev.filter(i => i.id !== playlistId));
          alert('Erro ao carregar playlist. Verifique o link ou tente novamente.');
        }

      } else {
        // É UM VÍDEO ÚNICO (ou texto com link)
        const videoIdMatch = input.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (videoIdMatch) {
          const url = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
          const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            url,
            status: 'processing',
            format: defaultFormat,
            quality: defaultQuality,
            info: null,
            progress: 0
          };
          setItems(prev => [newItem, ...prev]);
          fetchInfo(newItem.id, url);
        }
      }
    }

    setIsProcessing(false);
  };

  const fetchInfo = async (id, url) => {
    try {
      // Faz requisição de info para o backend
      // Se for vídeo de playlist, o fetchInfo pega o tamanho real/resolução aqui
      const response = await fetch(`${API_URL}/info?url=${encodeURIComponent(url)}`);

      if (!response.ok) throw new Error('Falha ao obter info');

      const data = await response.json();
      updateItem(id, {
        info: data,
        status: 'completed',
        progress: 100
      });
    } catch (e) {
      console.error(e);
      updateItem(id, { status: 'error', progress: 0 });
    }
  };

  const updateItem = (id, updates) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const triggerDownload = (item) => {
    // Quality é passado, removendo 'kbps' se presente para facilitar no backend
    const qualityParam = (item.quality || '192kbps').replace('kbps', '');
    const downloadUrl = `${API_URL}/download?url=${encodeURIComponent(item.url)}&format=${item.format}&quality=${qualityParam}`;

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

  const clearAll = () => {
    setItems([]);
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleFormatChange = (e) => {
    const newFormat = e.target.value;
    setDefaultFormat(newFormat);
    if (newFormat === 'mp3') {
      setDefaultQuality('192kbps');
    } else {
      setDefaultQuality('max');
    }
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
                <select value={defaultFormat} onChange={handleFormatChange}>
                  <option value="mp3">Somente Áudio (MP3)</option>
                  <option value="mp4">Video mp4</option>
                </select>

                {defaultFormat === 'mp3' ? (
                  <select value={defaultQuality} onChange={(e) => setDefaultQuality(e.target.value)}>
                    <option value="128kbps">128 kbps (Leve)</option>
                    <option value="192kbps">192 kbps (Padrão)</option>
                    <option value="320kbps">320 kbps (Alta)</option>
                  </select>
                ) : (
                  <select value={defaultQuality} onChange={(e) => setDefaultQuality(e.target.value)}>
                    <option value="1080p">1080p (Qualidade Máxima)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="360p">360p (Compatível)</option>
                  </select>
                )}
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
                <div className="header-actions">
                  <button className="clear-all-btn" onClick={clearAll}>
                    <Trash2 size={16} /> Limpar
                  </button>
                  {items.some(i => i.status === 'completed') && (
                    <button className="download-all-btn" onClick={downloadAll}>
                      <Download size={18} /> Baixar Todos ({items.filter(i => i.status === 'completed').length})
                    </button>
                  )}
                </div>
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
                      <span className="item-author">
                        {item.info
                          ? `${item.info.author} • ${item.format.toUpperCase()} • ${item.info.resolution || 'HD'} • ${item.info.size || '?'}`
                          : item.url}
                      </span>
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
        </section >
      </main >

      <footer className="glass">
        <div className="container center">
          <p>&copy; 2025 AlfaFormatura YT Converter</p>
        </div>
      </footer>
    </div >
  );
}

export default App;
