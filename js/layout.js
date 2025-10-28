document.addEventListener("DOMContentLoaded", () => {
    // Função para carregar um componente HTML num elemento placeholder
    const loadComponent = async (elementId, filePath) => {
        const element = document.getElementById(elementId);
        if (element) {
            try {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
                }
                const data = await response.text();
                element.innerHTML = data;

                // Lógicas específicas após o carregamento
                if (elementId === 'header-placeholder') {
                    setActiveNavLink();
                    handleHeaderScroll();
                }
            } catch (error) {
                console.error(`Error loading component:`, error);
            }
        }
    };

    // Função para marcar o link de navegação ativo
    const setActiveNavLink = () => {
        const navLinks = document.querySelectorAll('.navbar .menu a');
        const currentPage = window.location.pathname.split('/').pop();

        navLinks.forEach(link => {
            const linkPage = link.getAttribute('href').split('/').pop();
            // Trata o caso da página inicial (index.html ou /)
            if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    };

    let lastScrollY = 0; // Mover a variável para fora da função para que não seja reiniciada

    // Função para controlar a aparência do header ao rolar
    const handleHeaderScroll = () => {
        const header = document.querySelector('header');
        if (!header) return;

        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;

            if (window.scrollY > 50) { // Adiciona a classe após rolar 50px
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }

            // Lógica para esconder/mostrar a navbar
            if (currentScrollY > lastScrollY && currentScrollY > 50) { // Rolando para baixo
                header.classList.add('hidden');
            } else { // Rolando para cima
                header.classList.remove('hidden');
            }

            lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY; // Atualiza a última posição
        });
    };

    // Carrega todos os componentes e depois dispara um evento
    const loadAllComponents = async () => {
        await Promise.all([
            loadComponent("header-placeholder", "data/header.html"),
            loadComponent("footer-placeholder", "data/footer.html"),
            loadComponent("alert-placeholder", "data/alert.html"),
            loadComponent("mural-placeholder", "data/mural.html") // Adicionado
        ]);
        // Dispara um evento global quando tudo estiver carregado
        document.dispatchEvent(new Event('componentsLoaded'));
    };

    // --- LÓGICA DO BOTÃO "VOLTAR AO TOPO" ---
    const createBackToTopButton = () => {
        const btn = document.createElement('button');
        btn.id = 'back-to-top-btn';
        btn.className = 'back-to-top-btn';
        btn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
        btn.setAttribute('aria-label', 'Voltar ao topo');
        btn.setAttribute('title', 'Voltar ao topo');
        document.body.appendChild(btn);

        // Mostrar/esconder o botão
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        });

        // Ação de clique
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    };

    loadAllComponents();
    createBackToTopButton();
});