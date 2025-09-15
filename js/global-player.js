document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('global-player');
    if (!player) return;

    const elements = {
        audio: document.getElementById('global-audio-player'),
        playPauseBtn: document.getElementById('player-play-pause'),
        closeBtn: document.getElementById('player-close'),
        cover: document.getElementById('player-cover'),
        title: document.getElementById('player-title'),
        progress: document.getElementById('player-progress'),
        currentTime: document.getElementById('player-current-time'),
        duration: document.getElementById('player-duration'),
    };

    let previewTimeout;

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function playTrack(detail) {
        // Pausa e reseta o timeout anterior
        elements.audio.pause();
        clearTimeout(previewTimeout);

        // Atualiza a UI do player
        elements.cover.src = detail.cover;
        elements.title.textContent = detail.title;
        elements.audio.src = detail.audioSrc;

        // Mostra o player
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
    }

    // --- Event Listeners ---

    // Listener para o evento customizado que inicia a música
    document.addEventListener('playTrack', (e) => playTrack(e.detail));

    // Listeners dos controles do player
    elements.playPauseBtn.addEventListener('click', togglePlayPause);
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
        elements.playPauseBtn.textContent = '▶';
        clearTimeout(previewTimeout);
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