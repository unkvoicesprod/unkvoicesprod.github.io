import { db } from './firebase-init.js';
import { doc, getDoc, setDoc, increment, collection, getDocs, query, where, documentId } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

async function initializeItemDetail() {
    const container = document.getElementById("item-detail-view");

    // 1. Obter o ID do item a partir da URL
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('id');

    if (!itemId) {
        container.innerHTML = "<h1>Item não encontrado</h1><p>O ID do item não foi fornecido na URL.</p>";
        return;
    }

    try {
        // 2. Otimização: Carregar apenas o item específico se a estrutura de dados permitir.
        // Por enquanto, mantemos o fetch do JSON completo, mas esta é a principal área para melhoria futura.
        // Exemplo futuro: const response = await fetch(`data/items/${itemId}.json`);
        const response = await fetch("data/conteudo.json");
        if (!response.ok) {
            throw new Error("Não foi possível carregar o conteúdo.");
        }
        const allContent = await response.json();

        // 3. Encontrar o item específico pelo ID
        const item = allContent.find(content => content.id.toString() === itemId);

        if (!item) {
            container.innerHTML = "<h1>Item não encontrado</h1><p>Não existe um item com o ID fornecido.</p>";
            return;
        }

        // 4. Incrementar a visualização (se for a primeira vez)
        triggerViewCountOnce(itemId);

        // 5. Atualizar as meta tags da página dinamicamente
        updateMetaTags(item);

        // 6. Renderizar os detalhes do item na página
        renderItemDetails(item);

        // 7. Otimização: Buscar contagens de visualizações apenas para os itens relevantes
        const relatedItems = getRelatedItems(item, allContent);
        const idsToFetchViews = [itemId, ...relatedItems.map(i => i.id)];
        const viewCounts = await fetchSpecificViewCounts(idsToFetchViews);

        // 8. Renderizar itens relacionados
        renderRelatedItems(item, allContent, viewCounts);

    } catch (error) {
        console.error("Erro ao carregar detalhes do item:", error);
        container.innerHTML = "<h1>Erro</h1><p>Ocorreu um erro ao carregar as informações. Tente novamente mais tarde.</p>";
    }
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

function renderItemDetails(item) {
    const container = document.getElementById("item-detail-view");

    const priceText = item.preco > 0 ? `$${item.preco.toFixed(2)}` : "Grátis";
    const buttonText = item.preco === 0 ? '<i class="fa-solid fa-download"></i> Baixar' : '<i class="fa-solid fa-cart-shopping"></i> Comprar';
    const actionButton = item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="btn download" data-item-id="${item.id}" data-item-title="${item.titulo}">${buttonText}</a>` : '';

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

    // Adiciona listener para o botão de comprar/baixar para contar a view
    const downloadBtn = container.querySelector('.btn.download');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => triggerViewCountOnce(item.id.toString()));
    }

    // Adiciona o listener para o botão de play da página de detalhe
    const playDetailBtn = document.getElementById('play-detail-btn');
    if (playDetailBtn) {
        playDetailBtn.addEventListener('click', () => {
            const infoDiv = document.querySelector('.item-info');
            if (!infoDiv.dataset.audioSrc) return;

            // Conta a view ao clicar em "Tocar Prévia"
            triggerViewCountOnce(item.id.toString());

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

/**
 * Otimização: Separa a lógica de obter os itens relacionados da sua renderização.
 * @param {object} currentItem O item principal.
 * @param {Array<object>} allContent A lista completa de conteúdo.
 * @returns {Array<object>} Uma lista de até 4 itens relacionados.
 */
function getRelatedItems(currentItem, allContent) {
    // 1. Tenta encontrar itens da mesma categoria (excluindo o atual)
    const sameCategoryItems = allContent.filter(
        item => item.categoria === currentItem.categoria && item.id !== currentItem.id
    );

    // 2. Se encontrar, embaralha e retorna até 4.
    if (sameCategoryItems.length > 0) {
        return sameCategoryItems.sort(() => 0.5 - Math.random()).slice(0, 4);
    }

    // 3. Se não, pega até 4 itens aleatórios de outras categorias como fallback.
    const otherItems = allContent.filter(item => item.id !== currentItem.id);
    return otherItems.sort(() => 0.5 - Math.random()).slice(0, 4);
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
    relatedContainer.innerHTML = relatedItems.map(item => createRelatedItemCard(item, viewCounts)).join('');

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
    const imagePath = new URL(item.capa, window.location.href).href;
    const badgeClassMap = { "beats": "beat", "kits": "kit", "software": "kit" };
    const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'kit';

    const viewCount = viewCounts[item.id] || 0;
    const viewCountHtml = `<span class="card-views"><i class="fa-solid fa-eye"></i> ${viewCount.toLocaleString('pt-PT')}</span>`;

    // Card simplificado apenas com link para a página do item
    return `
        <div class="card" data-id="${item.id}">
            <a href="item.html?id=${item.id}" class="card-link-wrapper">
                <div class="card-image-container" data-src-full="${imagePath}">
                    <img src="${item.capaPlaceholder || ''}" class="img-placeholder" alt="Placeholder para ${item.titulo}" loading="eager" decoding="async" width="320" height="180">
                    <img data-src="${imagePath}" class="img-full" alt="${item.titulo}" decoding="async" width="320" height="180">
                </div>
                <div class="card-content">
                    <span class="badge ${badgeClass}">${item.categoria}</span>
                    <h3>${item.titulo}</h3>
                    <p><strong>${item.genero}</strong> - ${item.ano}</p>
                    ${viewCountHtml}
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

// Espera o DOM carregar e, em seguida, espera os componentes serem carregados pelo layout.js
document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener('componentsLoaded', initializeItemDetail, { once: true });
});