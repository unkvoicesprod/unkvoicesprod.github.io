import { db } from './firebase-init.js';
import { doc, getDoc, setDoc, increment, collection, getDocs, query, where, documentId } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { toggleFavorite, isFavorite } from './favorites.js';

async function initializeItemDetail() {
    const container = document.getElementById("item-detail-view");

    // 1. Obter o ID do item a partir da URL
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('id');

    if (!itemId) {
        // Remove o skeleton e mostra a mensagem de erro
        container.classList.remove('skeleton-loading');
        container.innerHTML = "<h1>Item não encontrado</h1><p>O ID do item não foi fornecido na URL.</p>";
        return;
    }

    try {
        // 2. Carrega tanto o conteúdo principal quanto os posts do YouTube
        const [contentResponse, postsResponse] = await Promise.all([
            fetch("data/conteudo.json"),
            fetch("data/posts.json"),
        ]);

        if (!contentResponse.ok) throw new Error(`Erro ao carregar conteudo.json: ${contentResponse.status}`);
        if (!postsResponse.ok) throw new Error(`Erro ao carregar posts.json: ${postsResponse.status}`);

        const contentItems = await contentResponse.json();
        const postItems = await postsResponse.json();

        // Processa os posts do YouTube para obter os detalhes
        const processedPosts = await processYouTubePosts(postItems);
        const allContent = [...contentItems, ...processedPosts];

        // 3. Encontrar o item específico pelo ID
        const item = allContent.find(content => content.id.toString() === itemId);

        if (!item) {
            container.classList.remove('skeleton-loading');
            container.innerHTML = "<h1>Item não encontrado</h1><p>Não existe um item com o ID fornecido.</p>";
            return;
        }

        // 4. Incrementar a visualização (se for a primeira vez e não for um post do YouTube)
        // A visualização de posts do YouTube é contada na própria plataforma.
        triggerViewCountOnce(itemId);

        // 5. Otimização: Buscar contagens de visualizações para o item atual e os relacionados
        const relatedItems = getRelatedItems(item, allContent);
        const idsToFetchViews = [itemId, ...relatedItems.map(i => i.id)];
        const viewCounts = await fetchSpecificViewCounts(idsToFetchViews);

        // 6. Atualizar as meta tags da página dinamicamente
        updateMetaTags(item);

        // 7. Renderizar os detalhes do item na página, agora com a contagem de views
        renderItemDetails(item, viewCounts[itemId] || 0);

        // 8. Renderizar itens relacionados, passando as contagens
        renderRelatedItems(item, allContent, viewCounts);

    } catch (error) {
        console.error("Erro ao carregar detalhes do item:", error);
        container.classList.remove('skeleton-loading');
        container.innerHTML = "<h1>Erro</h1><p>Ocorreu um erro ao carregar as informações. Tente novamente mais tarde.</p>";
    }
}

/**
 * Processa a lista de URLs do YouTube para obter metadados.
 * (Lógica duplicada de conteudo.js para manter o módulo independente)
 * @param {Array<object>} posts Lista de objetos com a chave youtubeUrl.
 * @returns {Promise<Array<object>>} Uma lista de objetos de item processados.
 */
async function processYouTubePosts(posts) {
    const postPromises = posts.map(async (post, index) => {
        try {
            const response = await fetch(`https://noembed.com/embed?url=${post.youtubeUrl}`);
            const data = await response.json();

            const url = new URL(post.youtubeUrl);
            const videoId = url.searchParams.get('v') || url.pathname.split('/').pop();
            const postId = `yt_${videoId || index}`;
            return {
                id: postId,
                videoId: videoId,
                titulo: data.title || `Post do YouTube #${index + 1}`,
                capa: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                genero: data.author_name || "YouTube",
                categoria: "Post",
                ano: new Date().getFullYear(),
                isYouTubePost: true,
                preco: 0,
                link: post.youtubeUrl,
                descricao: data.title || `Um vídeo do canal ${data.author_name || 'UNKVOICES'}.`
            };
        } catch (error) { return null; }
    });
    return (await Promise.all(postPromises)).filter(p => p !== null);
}
/**
 * Dispara o incremento da contagem de visualizações, mas apenas uma vez por item por utilizador (usando localStorage).
 * @param {string} itemId O ID do item.
 */
function triggerViewCountOnce(itemId) {
    if (!itemId) return;

    try {
        const viewedItemsKey = 'unkvoices_viewed_items';
        const viewedItems = JSON.parse(localStorage.getItem(viewedItemsKey)) || [];

        if (!viewedItems.includes(itemId)) {
            // Se o item ainda não foi "visto", incrementa no Firebase
            incrementViewCount(itemId);

            // Adiciona o ID à lista e salva no localStorage
            viewedItems.push(itemId);
            localStorage.setItem(viewedItemsKey, JSON.stringify(viewedItems));
        }
    } catch (error) { console.error("Erro ao gerir o estado de visualização:", error); }
}

/**
 * Incrementa a contagem de visualizações de um item no Firestore.
 * @param {string} itemId O ID do item.
 */
async function incrementViewCount(itemId) {
    if (!db || !itemId) return;
    try {
        const viewRef = doc(db, "views", itemId.toString());
        await setDoc(viewRef, { count: increment(1) }, { merge: true });
    } catch (error) { console.error("Falha ao incrementar visualização:", error); }
}

/**
 * Otimização: Busca contagens de visualizações apenas para uma lista específica de IDs.
 * @param {string[]} itemIds Array de IDs dos itens para buscar as contagens.
 * @returns {Promise<Object<string, number>>} Um objeto mapeando ID para contagem.
 */
async function fetchSpecificViewCounts(itemIds = []) {
    if (!db || itemIds.length === 0) return {};

    // O Firestore permite até 30 IDs em uma cláusula 'in'
    if (itemIds.length > 30) {
        console.warn("A busca de visualizações está limitada aos primeiros 30 IDs.");
        itemIds = itemIds.slice(0, 30);
    }

    const counts = {};
    try {
        const q = query(collection(db, "views"), where(documentId(), "in", itemIds.map(String)));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            counts[doc.id] = doc.data().count;
        });
    } catch (error) { console.error("Falha ao buscar contagens de visualizações específicas:", error); }
    return counts;
}

function updateMetaTags(item) {
    const fullUrl = `https://unkvoices.github.io/item.html?id=${item.id}`;
    const imageUrl = new URL(item.capa, window.location.href).href; // Garante URL absoluta para a imagem

    document.title = `${item.titulo} | UNKVOICES`;

    // Adiciona ou atualiza a tag canónica
    document.head.insertAdjacentHTML('beforeend', `<link rel="canonical" href="${fullUrl}" />`);

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

function renderItemDetails(item, viewCount = 0) {
    const container = document.getElementById("item-detail-view");
    const template = document.getElementById("item-detail-template");

    if (!container || !template) return;

    container.classList.remove('skeleton-loading'); // Remove a classe do skeleton
    container.innerHTML = ''; // Limpa o loader
    const clone = template.content.cloneNode(true);

    // Seleciona os elementos do template clonado
    const infoDiv = clone.querySelector('.item-info');
    const badge = clone.querySelector('.badge');
    const actionsContainer = clone.querySelector('.item-actions');
    const socialButtons = clone.querySelector('.social-share-buttons');
    const imageWrapper = clone.querySelector('.item-image-wrapper');

    // Preenche os dados básicos
    if (item.isYouTubePost && item.videoId) {
        // Se for um post do YouTube, substitui a imagem por um player embutido.
        imageWrapper.innerHTML = `
            <div class="youtube-player-container">
                <iframe src="https://www.youtube.com/embed/${item.videoId}?autoplay=0&rel=0&controls=1" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                </iframe>
            </div>`;
    } else {
        // Para outros itens, mantém a imagem.
        imageWrapper.innerHTML = `<img class="item-image" src="${item.capa}" alt="${item.titulo}">`;
    }
    infoDiv.dataset.title = item.titulo;
    infoDiv.dataset.cover = item.capa;
    const badgeClassMap = { "beats": "beat", "kits & plugins": "kit", "vst": "kit", "post": "post" };
    badge.className = `badge ${badgeClassMap[item.categoria.toLowerCase()] || 'kit'}`;
    badge.textContent = item.categoria;
    clone.querySelector('.item-title').textContent = item.titulo;
    clone.querySelector('.item-description').textContent = item.descricao;
    clone.querySelector('.item-genre span').textContent = item.genero || 'N/A';
    clone.querySelector('.item-views span').textContent = `${viewCount.toLocaleString('pt-PT')} visualizações`;
    clone.querySelector('.item-year span').textContent = item.ano || 'N/A';

    // Preço
    const priceText = item.preco > 0 ? `$${item.preco.toFixed(2)}` : "Grátis";
    clone.querySelector('.price').textContent = priceText;

    // Botão de Favorito
    const favoriteButton = document.createElement('button');
    favoriteButton.id = 'favorite-detail-btn';
    favoriteButton.className = 'btn btn-outline favorite-btn';
    favoriteButton.title = 'Adicionar aos Favoritos';
    const updateFavoriteButton = () => {
        const isFav = isFavorite(item.id.toString());
        favoriteButton.innerHTML = isFav ? '<i class="fa-solid fa-heart"></i> Favorito' : '<i class="fa-regular fa-heart"></i> Favoritar';
        favoriteButton.classList.toggle('is-favorite', isFav);
    };
    updateFavoriteButton(); // Estado inicial
    favoriteButton.addEventListener('click', () => { toggleFavorite(item.id.toString()); updateFavoriteButton(); });
    actionsContainer.appendChild(favoriteButton);

    // Botão de Ação (Comprar/Baixar)
    if (item.link && !item.isYouTubePost) { // Não mostra o botão "Comprar" para vídeos do YouTube
        const buttonText = item.preco === 0 ? '<i class="fa-solid fa-download"></i> Baixar' : '<i class="fa-solid fa-cart-shopping"></i> Comprar';
        const actionButton = document.createElement('a');
        actionButton.href = item.link;
        actionButton.target = '_blank';
        actionButton.rel = 'noopener noreferrer';
        actionButton.className = 'btn download';
        actionButton.innerHTML = buttonText;
        actionButton.addEventListener('click', () => triggerViewCountOnce(item.id.toString()));
        actionsContainer.appendChild(actionButton);
    }

    // Botão de Play
    if (item.audioPreview && !item.isYouTubePost) {
        infoDiv.dataset.audioSrc = item.audioPreview;
        const playButton = document.createElement('button');
        playButton.id = 'play-detail-btn';
        playButton.className = 'btn play';
        playButton.innerHTML = '▶ Tocar Prévia';
        playButton.addEventListener('click', () => {
            triggerViewCountOnce(item.id.toString());
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
        actionsContainer.appendChild(playButton);
    }

    // Botão "Ver no YouTube" para posts de vídeo
    if (item.isYouTubePost) {
        const youtubeButton = document.createElement('a');
        youtubeButton.href = item.link;
        youtubeButton.target = '_blank';
        youtubeButton.rel = 'noopener noreferrer';
        youtubeButton.className = 'btn download'; // Reutiliza o estilo do botão de download
        youtubeButton.innerHTML = '<i class="fa-brands fa-youtube"></i> Ver no YouTube';
        actionsContainer.appendChild(youtubeButton);
    }


    // Botão de Copiar Link
    const copyLinkButton = document.createElement('button');
    copyLinkButton.id = 'copy-link-btn';
    copyLinkButton.className = 'btn btn-outline';
    copyLinkButton.innerHTML = '🔗 Copiar Link';
    copyLinkButton.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            const originalText = copyLinkButton.innerHTML;
            copyLinkButton.innerHTML = '✅ Copiado!';
            copyLinkButton.disabled = true;
            setTimeout(() => {
                copyLinkButton.innerHTML = originalText;
                copyLinkButton.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Falha ao copiar o link: ', err);
        });
    });
    actionsContainer.appendChild(copyLinkButton);

    // Links de Compartilhamento Social
    const pageUrl = window.location.href;
    const shareText = encodeURIComponent(`Confira "${item.titulo}" na UNKVOICES!`);
    const encodedPageUrl = encodeURIComponent(pageUrl);
    socialButtons.querySelector('.twitter').href = `https://twitter.com/intent/tweet?url=${encodedPageUrl}&text=${shareText}`;
    socialButtons.querySelector('.facebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodedPageUrl}`;
    socialButtons.querySelector('.whatsapp').href = `https://api.whatsapp.com/send?text=${shareText}%20${encodedPageUrl}`;

    // Adiciona o conteúdo clonado e preenchido ao container
    container.appendChild(clone);
}

/**
 * Otimização: Separa a lógica de obter os itens relacionados da sua renderização.
 * @param {object} currentItem O item principal.
 * @param {Array<object>} allContent A lista completa de conteúdo.
 * @returns {Array<object>} Uma lista de até 4 itens relacionados.
 */
function getRelatedItems(currentItem, allContent) {
    // Filtra por mesma categoria, excluindo o item atual.
    let related = allContent.filter(
        item => item.categoria === currentItem.categoria && item.id !== currentItem.id
    );

    // Se não houver itens suficientes na mesma categoria, completa com itens aleatórios de outras categorias.
    const needed = 4 - related.length;
    if (needed > 0) {
        const otherItems = allContent.filter(item => item.categoria !== currentItem.categoria && item.id !== currentItem.id);
        related.push(...otherItems.sort(() => 0.5 - Math.random()).slice(0, needed));
    }

    // Embaralha o resultado final e pega os 4 primeiros.
    return related.sort(() => 0.5 - Math.random()).slice(0, 4);
}

function renderRelatedItems(currentItem, allContent, viewCounts) {
    const relatedContainer = document.getElementById('related-items-container');
    const relatedSection = document.getElementById('related-items-section');
    const relatedTitle = relatedSection ? relatedSection.querySelector('h2') : null;

    if (!relatedContainer || !relatedSection || !relatedTitle) return;

    const relatedItems = getRelatedItems(currentItem, allContent);

    // Define o título com base na categoria dos itens encontrados
    const hasSameCategory = relatedItems.some(item => item.categoria === currentItem.categoria);
    relatedTitle.textContent = hasSameCategory ? "Itens Relacionados" : "Você também pode gostar";

    if (relatedItems.length === 0) {
        relatedSection.style.display = 'none'; // Esconde a seção se não houver itens
        return;
    }

    // Mostra a seção e renderiza os cards
    relatedSection.style.display = 'block';
    relatedContainer.innerHTML = ''; // Limpa o container
    const fragment = document.createDocumentFragment();
    relatedItems.forEach(item => {
        const cardNode = createRelatedItemCard(item, viewCounts);
        if (cardNode) fragment.appendChild(cardNode);
    });
    relatedContainer.appendChild(fragment);

    // Anima os cards para que apareçam suavemente
    setTimeout(() => {
        const cards = relatedContainer.querySelectorAll('.card');
        observeCards(cards);
    }, 0);
}

/**
 * Observa os cards e adiciona a classe 'is-visible' quando eles entram no viewport.
 * @param {NodeListOf<Element>} cards A lista de elementos de card a serem observados.
 */
function observeCards(cards) {
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); // Deixa de observar o elemento após a animação
            }
        });
    }, { threshold: 0.1 }); // A animação começa quando 10% do card está visível

    cards.forEach(card => {
        observer.observe(card);
    });

    // Observador para carregar imagens de alta qualidade (lazy loading)
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const container = entry.target;
                const imgFull = container.querySelector('.img-full');
                imgFull.src = imgFull.dataset.src; // Inicia o carregamento
                imgFull.onload = () => container.classList.add('is-loaded'); // Mostra a imagem quando carregada
                observer.unobserve(container); // Para de observar
            }
        });
    }, { rootMargin: "100px" });

    document.querySelectorAll('#related-items-container .card-image-container').forEach(img => imageObserver.observe(img));
}

function createRelatedItemCard(item, viewCounts = {}) {
    const template = document.getElementById('card-template');
    if (!template) return null;

    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.card');
    const link = clone.querySelector('.card-link-wrapper');
    const imageContainer = clone.querySelector('.card-image-container');
    const badge = clone.querySelector('.badge');

    card.dataset.id = item.id;
    link.href = `item.html?id=${item.id}`;

    imageContainer.dataset.srcFull = item.capa;
    clone.querySelector('.img-placeholder').src = item.capaPlaceholder || '';
    clone.querySelector('.img-placeholder').alt = `Placeholder para ${item.titulo}`;
    clone.querySelector('.img-full').dataset.src = item.capa;
    clone.querySelector('.img-full').alt = item.titulo;

    const badgeClassMap = { "beats": "beat", "kits & plugins": "kit", "vst": "kit" };
    const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'kit';
    badge.className = `badge ${badgeClass}`;
    badge.textContent = item.categoria;

    clone.querySelector('h3').textContent = item.titulo;
    clone.querySelector('.card-meta').innerHTML = `<strong>${item.genero}</strong> - ${item.ano}`;

    const viewCount = viewCounts[item.id] || 0;
    clone.querySelector('.card-views').innerHTML = `<i class="fa-solid fa-eye"></i> ${viewCount.toLocaleString('pt-PT')}`;

    return clone;
}

// Adiciona um serviço de "proxy" para os robôs de redes sociais
const userAgent = navigator.userAgent.toLowerCase();
const isCrawler = /bot|facebook|embedly|pinterest|slack|twitter|whatsapp|google|yahoo|bing|duckduckgo|yandex|baidu/i.test(userAgent);

if (isCrawler) {
    // Se for um crawler, não fazemos nada, pois o Netlify/Vercel fará o trabalho de reescrever o HTML no servidor.
    // Para GitHub Pages, essa abordagem com JS puro é a melhor possível, mas pode não funcionar em todas as plataformas de chat.
}

// Espera o DOM carregar e, em seguida, espera os componentes serem carregados pelo layout.js
document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener('componentsLoaded', initializeItemDetail, { once: true });
});