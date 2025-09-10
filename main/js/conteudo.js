
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
            applyFilters(); // Chamada inicial para renderizar o conteúdo da página
        } catch (error) {
            console.error("Falha ao carregar o conteúdo:", error);
            elements.container.innerHTML = `<p class="error-message">Não foi possível carregar o conteúdo. Tente novamente mais tarde.</p>`;
        }
    }

    function renderContent(list) {
        // Esconde os filtros na página inicial, pois ela tem conteúdo fixo
        if (getPageFilter().home) {
            document.querySelector('.filters').style.display = 'none';
            document.querySelector('.search-bar-full').style.display = 'none';
        }
        if (!list.length) {
            elements.container.innerHTML = `<p class="no-results">Nenhum item encontrado.</p>`;
            return;
        }

        elements.container.innerHTML = list.map(item => {
            // Mapeia a categoria para a classe CSS do badge
            const badgeClassMap = {
                "beats": "beat",
                "kits & plugins": "kit",
                "posts": "post",
                "post": "post" // Adicionado para compatibilidade com "Post" singular
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
        const pageFilter = getPageFilter();

        const searchTerm = elements.search.value.toLowerCase();
        const selected = {
            genero: elements.filtroGenero.value,
            categoria: elements.filtroCategoria.value,
            ano: elements.filtroAno.value,
            tipo: elements.filtroTipo.value,
        };

        let baseContent = allContent;

        // 1. Aplicar o filtro base da página
        if (pageFilter.home) {
            baseContent = [...allContent]
                .sort((a, b) => b.ano - a.ano || b.id - a.id)
                .slice(0, 3);
        } else if (pageFilter.categoria) {
            baseContent = allContent.filter(item => item.categoria === pageFilter.categoria);
        } else if (pageFilter.preco === ">0") {
            baseContent = allContent.filter(item => item.preco > 0);
        }

        const filtered = baseContent.filter(item => {
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

        // Se for a página inicial, não aplicar filtros de utilizador, mostrar apenas o conteúdo base
        if (pageFilter.home) {
            renderContent(baseContent);
        } else {
            renderContent(filtered);
        }
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

    function getPageFilter() {
        if (window.location.pathname.includes("beats.html")) return { categoria: "Beats" };
        if (window.location.pathname.includes("kits.html")) return { categoria: "Kits & Plugins" };
        if (window.location.pathname.includes("loja.html")) return { preco: ">0" };
        if (window.location.pathname.includes("posts.html")) return { categoria: "Posts" };
        if (window.location.pathname.includes("index.html") || window.location.pathname.endsWith('/')) return { home: true };
        return {};
    }

    // Inicia a aplicação
    init();
});
