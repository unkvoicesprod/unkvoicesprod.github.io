document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('global-player');
    if (!player) return;

    const elements = {
        audio: document.getElementById('global-audio-player'),
        playPauseBtn: document.getElementById('player-play-pause'),
        prevBtn: document.getElementById('player-prev'),
        nextBtn: document.getElementById('player-next'),
        closeBtn: document.getElementById('player-close'),
        cover: document.getElementById('player-cover'),
        title: document.getElementById('player-title'),
        progress: document.getElementById('player-progress'),
        currentTime: document.getElementById('player-current-time'),
        duration: document.getElementById('player-duration'),
    };

    let currentPlaylist = [];
    let currentIndex = -1;
    let previewTimeout;


    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function setPlaylist(playlist, startIndex = 0) {
        currentPlaylist = playlist;
        playTrackAtIndex(startIndex);
    }

    function playTrackAtIndex(index) {
        if (index < 0 || index >= currentPlaylist.length) return;

        currentIndex = index;
        const track = currentPlaylist[currentIndex];

        // Dispara um evento para notificar a UI sobre a faixa atual
        document.dispatchEvent(new CustomEvent('trackChanged', { detail: { trackId: track.id } }));

        // Pausa e reseta o timeout anterior
        elements.audio.pause();
        clearTimeout(previewTimeout);

        // Atualiza a UI do player
        elements.cover.src = track.cover;
        elements.title.textContent = track.title;
        elements.audio.src = track.audioSrc;
        player.classList.remove('hidden');

        // Toca a música
        const playPromise = elements.audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                elements.playPauseBtn.textContent = '❚❚';
                // Define um limite de 30 segundos para a prévia
                previewTimeout = setTimeout(() => {
                    elements.audio.pause();
                }, 30000);
            }).catch(error => {
                console.error("Erro ao tocar o áudio:", error);
                elements.playPauseBtn.textContent = '▶';
            });
        }
    }

    function playNext() {
        const nextIndex = (currentIndex + 1) % currentPlaylist.length;
        playTrackAtIndex(nextIndex);
    }

    function playPrevious() {
        const prevIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
        playTrackAtIndex(prevIndex);
    }

    function togglePlayPause() {
        if (elements.audio.paused) {
            if (elements.audio.currentTime >= 29.9) { // Se a prévia terminou, reinicia
                elements.audio.currentTime = 0;
            }
            elements.audio.play();
        } else {
            elements.audio.pause();
        }
    }

    function updateProgress() {
        const progressValue = (elements.audio.currentTime / 30) * 100;
        elements.progress.value = elements.audio.currentTime;
        elements.currentTime.textContent = formatTime(elements.audio.currentTime);
    }

    function seek(event) {
        elements.audio.currentTime = event.target.value;
    }

    function closePlayer() {
        elements.audio.pause();
        player.classList.add('hidden');

        // Dispara um evento para limpar o destaque
        document.dispatchEvent(new CustomEvent('trackChanged', { detail: { trackId: null } }));
    }

    // --- Event Listeners ---

    // Listener para o evento customizado que inicia a playlist
    document.addEventListener('playPlaylist', (e) => setPlaylist(e.detail.playlist, e.detail.startIndex));

    // Listeners dos controles do player
    elements.playPauseBtn.addEventListener('click', togglePlayPause);
    elements.prevBtn.addEventListener('click', playPrevious);
    elements.nextBtn.addEventListener('click', playNext);
    elements.closeBtn.addEventListener('click', closePlayer);

    // Listeners do elemento de áudio
    elements.audio.addEventListener('play', () => {
        elements.playPauseBtn.textContent = '❚❚';
    });
    elements.audio.addEventListener('pause', () => {
        elements.playPauseBtn.textContent = '▶';
        clearTimeout(previewTimeout);
    });
    elements.audio.addEventListener('ended', () => {
        playNext(); // Toca a próxima música automaticamente
    });
    elements.audio.addEventListener('timeupdate', updateProgress);

    // Listeners da barra de progresso
    elements.progress.addEventListener('input', seek);

    // Carrega metadados para definir a duração (embora fixemos em 30s)
    elements.audio.addEventListener('loadedmetadata', () => {
        const trackDuration = Math.min(elements.audio.duration, 30);
        elements.progress.max = trackDuration;
        elements.duration.textContent = formatTime(trackDuration);
    });
});