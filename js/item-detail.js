document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("item-detail-container");

    // 1. Obter o ID do item a partir da URL
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('id');

    if (!itemId) {
        container.innerHTML = "<h1>Item não encontrado</h1><p>O ID do item não foi fornecido na URL.</p>";
        return;
    }

    try {
        // 2. Carregar todos os itens do JSON
        const response = await fetch("data/conteudo.json");
        if (!response.ok) throw new Error("Não foi possível carregar os dados.");
        const allContent = await response.json();

        // 3. Encontrar o item específico pelo ID
        const item = allContent.find(content => content.id.toString() === itemId);

        if (!item) {
            container.innerHTML = "<h1>Item não encontrado</h1><p>Não existe um item com o ID fornecido.</p>";
            return;
        }

        // 4. Atualizar as meta tags da página dinamicamente
        updateMetaTags(item);

        // 5. Renderizar os detalhes do item na página
        renderItemDetails(item);

    } catch (error) {
        console.error("Erro ao carregar detalhes do item:", error);
        container.innerHTML = "<h1>Erro</h1><p>Ocorreu um erro ao carregar as informações. Tente novamente mais tarde.</p>";
    }
});

function updateMetaTags(item) {
    const fullUrl = `https://unkvoices.github.io/item.html?id=${item.id}`;
    const imageUrl = new URL(item.capa, window.location.href).href; // Garante URL absoluta para a imagem

    document.title = `${item.titulo} | UNKVOICES`;

    // Meta tags padrão e de SEO
    document.querySelector('meta[name="description"]').setAttribute('content', item.descricao);

    // Open Graph (Facebook, WhatsApp, etc.)
    document.querySelector('meta[property="og:title"]').setAttribute('content', item.titulo);
    document.querySelector('meta[property="og:description"]').setAttribute('content', item.descricao);
    document.querySelector('meta[property="og:image"]').setAttribute('content', imageUrl);
    document.querySelector('meta[property="og:url"]').setAttribute('content', fullUrl);

    // Twitter
    document.querySelector('meta[property="twitter:title"]').setAttribute('content', item.titulo);
    document.querySelector('meta[property="twitter:description"]').setAttribute('content', item.descricao);
    document.querySelector('meta[property="twitter:image"]').setAttribute('content', imageUrl);
    document.querySelector('meta[property="twitter:url"]').setAttribute('content', fullUrl);
}

function renderItemDetails(item) {
    const container = document.getElementById("item-detail-container");

    const priceText = item.preco > 0 ? `R$ ${item.preco.toFixed(2)}` : "Grátis";
    const buttonText = item.preco === 0 ? '⬇ Baixar' : '🛒 Comprar';
    const actionButton = item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="btn download">${buttonText}</a>` : '';

    const playButton = item.audioPreview
        ? `<button id="play-detail-btn" class="btn play">▶ Tocar Prévia</button>`
        : '';

    container.innerHTML = `
        <img src="${item.capa}" alt="${item.titulo}">
        <div class="item-info" data-audio-src="${item.audioPreview || ''}" data-title="${item.titulo}" data-cover="${item.capa}">
            <span class="badge ${item.categoria.toLowerCase() === 'beats' ? 'beat' : 'kit'}">${item.categoria}</span>
            <h1>${item.titulo}</h1>
            <p>${item.descricao}</p>
            <p><strong>Gênero:</strong> ${item.genero || 'N/A'}</p>
            <p><strong>Ano:</strong> ${item.ano || 'N/A'}</p>
            
            <div class="price">${priceText}</div>

            <div class="item-actions">
                ${actionButton}
                ${playButton}
            </div>
        </div>
    `;

    // Adiciona o listener para o botão de play da página de detalhe
    const playDetailBtn = document.getElementById('play-detail-btn');
    if (playDetailBtn) {
        playDetailBtn.addEventListener('click', () => {
            const infoDiv = document.querySelector('.item-info');
            const trackData = {
                audioSrc: infoDiv.dataset.audioSrc,
                title: infoDiv.dataset.title,
                cover: infoDiv.dataset.cover
            };

            if (!trackData.audioSrc) return;
            document.dispatchEvent(new CustomEvent('playTrack', { detail: trackData }));
        });
    }
}

// Adiciona um serviço de "proxy" para os robôs de redes sociais
const userAgent = navigator.userAgent.toLowerCase();
const isCrawler = /bot|facebook|embedly|pinterest|slack|twitter|whatsapp|google|yahoo|bing|duckduckgo|yandex|baidu/i.test(userAgent);

if (isCrawler) {
    // Se for um crawler, não fazemos nada, pois o Netlify/Vercel fará o trabalho de reescrever o HTML no servidor.
    // Para GitHub Pages, essa abordagem com JS puro é a melhor possível, mas pode não funcionar em todas as plataformas de chat.
}