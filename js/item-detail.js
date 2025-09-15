document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("item-detail-view");

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

        // 6. Renderizar itens relacionados
        renderRelatedItems(item, allContent);

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
    const container = document.getElementById("item-detail-view");

    const priceText = item.preco > 0 ? `R$ ${item.preco.toFixed(2)}` : "Grátis";
    const buttonText = item.preco === 0 ? '⬇ Baixar' : '🛒 Comprar';
    const actionButton = item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="btn download">${buttonText}</a>` : '';

    const playButton = item.audioPreview
        ? `<button id="play-detail-btn" class="btn play">▶ Tocar Prévia</button>`
        : '';

    const copyLinkButton = `<button id="copy-link-btn" class="btn btn-outline">🔗 Copiar Link</button>`;

    // Lógica para compartilhamento em redes sociais
    const pageUrl = window.location.href;
    const shareText = encodeURIComponent(`Confira "${item.titulo}" na UNKVOICES!`);
    const encodedPageUrl = encodeURIComponent(pageUrl);

    const twitterUrl = `https://twitter.com/intent/tweet?url=${encodedPageUrl}&text=${shareText}`;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedPageUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${shareText}%20${encodedPageUrl}`;

    // Ícones Font Awesome para os botões
    const twitterIcon = `<i class="fa-brands fa-twitter"></i>`;
    const facebookIcon = `<i class="fa-brands fa-facebook"></i>`;
    const whatsappIcon = `<i class="fa-brands fa-whatsapp"></i>`;

    const socialShareHtml = `
        <div class="social-share">
            <p><i class="fa-solid fa-arrow-up-from-bracket"></i> Compartilhar</p>
            <div class="social-share-buttons">
                <a href="${twitterUrl}" target="_blank" rel="noopener noreferrer" class="social-btn twitter" title="Compartilhar no Twitter">${twitterIcon}</a>
                <a href="${facebookUrl}" target="_blank" rel="noopener noreferrer" class="social-btn facebook" title="Compartilhar no Facebook">${facebookIcon}</a>
                <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="social-btn whatsapp" title="Compartilhar no WhatsApp">${whatsappIcon}</a>
            </div>
        </div>
    `;

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
                ${copyLinkButton}
            </div>
            ${socialShareHtml}
        </div>
    `;

    // Adiciona o listener para o botão de play da página de detalhe
    const playDetailBtn = document.getElementById('play-detail-btn');
    if (playDetailBtn) {
        playDetailBtn.addEventListener('click', () => {
            const infoDiv = document.querySelector('.item-info');
            if (!infoDiv.dataset.audioSrc) return;

            // Cria uma playlist com apenas este item
            const playlist = [{
                id: item.id,
                title: item.titulo,
                cover: item.capa,
                audioSrc: item.audioPreview,
                link: item.link,
                preco: item.preco
            }];

            document.dispatchEvent(new CustomEvent('playPlaylist', { detail: { playlist, startIndex: 0 } }));
        });
    }

    // Adiciona o listener para o botão de copiar link
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                // Feedback de sucesso
                const originalText = copyLinkBtn.innerHTML;
                copyLinkBtn.innerHTML = '✅ Copiado!';
                copyLinkBtn.disabled = true;

                setTimeout(() => {
                    copyLinkBtn.innerHTML = originalText;
                    copyLinkBtn.disabled = false;
                }, 2000); // Reverte após 2 segundos
            }).catch(err => {
                // Feedback de erro
                console.error('Falha ao copiar o link: ', err);
                copyLinkBtn.innerHTML = '❌ Falhou!';
                setTimeout(() => { copyLinkBtn.innerHTML = originalText; }, 2000);
            });
        });
    }
}

function renderRelatedItems(currentItem, allContent) {
    const relatedContainer = document.getElementById('related-items-container');
    const relatedSection = document.getElementById('related-items-section');
    const relatedTitle = relatedSection ? relatedSection.querySelector('h2') : null;

    if (!relatedContainer || !relatedSection || !relatedTitle) return;

    // 1. Tenta encontrar itens da mesma categoria (excluindo o atual)
    let relatedItems = allContent.filter(
        item => item.categoria === currentItem.categoria && item.id !== currentItem.id
    );

    // 2. Se não encontrar, pega itens aleatórios de outras categorias como fallback
    if (relatedItems.length === 0) {
        relatedTitle.textContent = "Você também pode gostar"; // Altera o título da seção
        relatedItems = allContent.filter(item => item.id !== currentItem.id);
    } else {
        relatedTitle.textContent = "Itens Relacionados"; // Garante o título padrão
    }

    // 3. Embaralha a lista de itens (seja da mesma categoria ou de todas)
    for (let i = relatedItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        // Troca os elementos de posição
        [relatedItems[i], relatedItems[j]] = [relatedItems[j], relatedItems[i]];
    }

    // 4. Limita a 4 itens e verifica se encontrou algum
    const finalRelatedItems = relatedItems.slice(0, 4);

    if (finalRelatedItems.length === 0) {
        relatedSection.style.display = 'none'; // Esconde a seção se não houver itens
        return;
    }

    // 5. Mostra a seção e renderiza os cards
    relatedSection.style.display = 'block';
    relatedContainer.innerHTML = finalRelatedItems.map(createRelatedItemCard).join('');

    // 6. Anima os cards para que apareçam suavemente
    setTimeout(() => {
        const cards = relatedContainer.querySelectorAll('.card');
        cards.forEach(card => card.classList.add('is-visible'));
    }, 100);
}

function createRelatedItemCard(item) {
    const imagePath = new URL(item.capa, window.location.href).href;
    const badgeClassMap = { "beats": "beat", "kits": "kit", "software": "kit", "posts": "post" };
    const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'kit';

    // Card simplificado apenas com link para a página do item
    return `
        <div class="card" data-id="${item.id}">
            <a href="item.html?id=${item.id}" class="card-link-wrapper">
                <div class="card-image-container">
                    <img src="${imagePath}" alt="${item.titulo}" loading="lazy" decoding="async" width="320" height="180">
                </div>
                <div class="card-content">
                    <span class="badge ${badgeClass}">${item.categoria}</span>
                    <h3>${item.titulo}</h3>
                    <p><strong>${item.genero}</strong> - ${item.ano}</p>
                </div>
            </a>
        </div>
    `;
}

// Adiciona um serviço de "proxy" para os robôs de redes sociais
const userAgent = navigator.userAgent.toLowerCase();
const isCrawler = /bot|facebook|embedly|pinterest|slack|twitter|whatsapp|google|yahoo|bing|duckduckgo|yandex|baidu/i.test(userAgent);

if (isCrawler) {
    // Se for um crawler, não fazemos nada, pois o Netlify/Vercel fará o trabalho de reescrever o HTML no servidor.
    // Para GitHub Pages, essa abordagem com JS puro é a melhor possível, mas pode não funcionar em todas as plataformas de chat.
}