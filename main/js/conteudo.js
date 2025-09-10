
/*
Chaves do JSON
Beats   /   Kits    /   Posts
*/


document.addEventListener("DOMContentLoaded", () => {
    // Estado da aplicação
    let allContent = [];

    // Cache de elementos do DOM para evitar múltiplas buscas
    const elements = {
        container: document.getElementById("conteudo-container"),
        search: document.getElementById("search"),
        filtroGenero: document.getElementById("filtro-genero"),
        filtroCategoria: document.getElementById("filtro-categoria"),
        filtroAno: document.getElementById("filtro-ano"),
        filtroTipo: document.getElementById("filtro-tipo"),
    };

    // Função principal que inicia a aplicação
    async function init() {
        try {
            const response = await fetch("data/conteudo.json");
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            allContent = await response.json();

            setupEventListeners();
            populateFilters();
            renderPageContent();
        } catch (error) {
            console.error("Falha ao carregar o conteúdo:", error);
            elements.container.innerHTML = `<p class="error-message">Não foi possível carregar o conteúdo. Tente novamente mais tarde.</p>`;
        }
    }

    function renderContent(list) {
        if (!list.length) {
            elements.container.innerHTML = `<p class="no-results">Nenhum item encontrado.</p>`;
            return;
        }

        elements.container.innerHTML = list.map(item => {
            // Mapeia a categoria para a classe CSS do badge
            const badgeClassMap = {
                "beats": "beat",
                "kits & plugins": "kit",
                "posts": "post"
            };
            const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'post';

            const actionButton = item.preco === 0
                ? `<button class="download">⬇ Baixar</button>`
                : `<button class="download">🛒 Comprar</button>`;

            const playButton = window.location.pathname.includes("beats.html")
                ? `<button class="play">▶ Play</button>`
                : "";

            return `
                <div class="card">
                    <img src="${item.capa}" alt="${item.titulo}">
                    <div class="card-content">
                        <span class="badge ${badgeClass}">${item.categoria}</span>
                        <h3 class="accordion-title">${item.titulo}</h3>
                        <p><strong>${item.genero}</strong> - ${item.ano}</p>
                        <p>${item.descricao}</p>
                        <div class="extra"><p>${item.conteudo}</p></div>
                        <div class="card-footer">
                            ${actionButton}
                            ${playButton}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function populateFilters() {
        const getUniqueValues = (key) => [...new Set(allContent.map(item => item[key]).filter(Boolean))];

        fillSelect(elements.filtroGenero, getUniqueValues('genero'));
        fillSelect(elements.filtroCategoria, getUniqueValues('categoria'));
        fillSelect(elements.filtroAno, getUniqueValues('ano').sort((a, b) => b - a)); // Ordena anos do mais recente para o mais antigo
        fillSelect(elements.filtroTipo, getUniqueValues('tipo'));
    }

    function fillSelect(selectElement, values) {
        if (!selectElement) return;
        const fragment = document.createDocumentFragment();
        values.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            fragment.appendChild(option);
        });
        selectElement.appendChild(fragment);
    }

    function applyFilters() {
        const searchTerm = elements.search.value.toLowerCase();
        const selected = {
            genero: elements.filtroGenero.value,
            categoria: elements.filtroCategoria.value,
            ano: elements.filtroAno.value,
            tipo: elements.filtroTipo.value,
        };

        const filtered = allContent.filter(item => {
            const matchesSearch = searchTerm === "" ||
                item.titulo.toLowerCase().includes(searchTerm) ||
                item.descricao.toLowerCase().includes(searchTerm) ||
                item.conteudo.toLowerCase().includes(searchTerm);

            const matchesFilters =
                (selected.genero === "" || item.genero === selected.genero) &&
                (selected.categoria === "" || item.categoria === selected.categoria) &&
                (selected.ano === "" || item.ano.toString() === selected.ano) &&
                (selected.tipo === "" || item.tipo === selected.tipo);

            return matchesSearch && matchesFilters;
        });

        renderContent(filtered);
    }

    function handleAccordionClick(event) {
        const title = event.target.closest('.accordion-title');
        if (!title) return;

        const card = title.closest('.card');
        const extra = card.querySelector('.extra');

        card.classList.toggle('active');

        if (card.classList.contains('active')) {
            extra.style.maxHeight = extra.scrollHeight + 'px';
        } else {
            extra.style.maxHeight = null;
        }
    }

    function setupEventListeners() {
        // Delegação de eventos para os cliques no acordeão
        elements.container.addEventListener('click', handleAccordionClick);

        // Listeners para os filtros
        elements.search.addEventListener("input", applyFilters);
        Object.values(elements).filter(el => el && el.tagName === 'SELECT').forEach(select => {
            select.addEventListener('change', applyFilters);
        });
    }

    // Inicia a aplicação
    init();
    function getPageFilter() {
        if (window.location.pathname.includes("beats.html")) return { categoria: "Beats" };
        if (window.location.pathname.includes("kits.html")) return { categoria: "Kits & Plugins" };
        if (window.location.pathname.includes("loja.html")) return { preco: ">0" };
        if (window.location.pathname.includes("posts.html")) return { categoria: "Posts" };
        if (window.location.pathname.includes("index.html") || window.location.pathname.endsWith("/")) return { home: true };
        return {};
    }

    function renderPageContent() {
        const filter = getPageFilter();
        let filtered = allContent;

        if (filter.home) {
            // últimos 3 posts ordenados por ano/ID
            filtered = [...allContent]
                .sort((a, b) => b.ano - a.ano || b.id - a.id)
                .slice(0, 3);
        } else if (filter.categoria) {
            filtered = allContent.filter(item => item.categoria === filter.categoria);
        } else if (filter.preco === ">0") {
            filtered = allContent.filter(item => item.preco > 0);
        }

        renderContent(filtered);
    }


    function renderPageContent() {
        const filter = getPageFilter();

        let filtered = allContent;

        if (filter === "Home") {
            // Exemplo: mostra apenas os 3 mais recentes
            filtered = allContent.slice(0, 3);
        } else if (filter === "Loja") {
            // Loja = só itens com preço > 0
            filtered = allContent.filter(item => item.preco > 0);
        } else if (filter) {
            filtered = allContent.filter(item => item.categoria === filter);
        }

        renderContent(filtered);
    }

});
