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
                    setupMobileMenu(); // Configura o menu mobile
                }
                // Adicione outras lógicas pós-carregamento aqui se necessário
            } catch (error) {
                console.error(`Error loading component:`, error);
                element.innerHTML = `<p style="color:red; text-align:center;">Falha ao carregar ${filePath}</p>`;
            }
        }
    };

    // Função para marcar o link de navegação ativo
    const setActiveNavLink = () => {
        const navLinks = document.querySelectorAll('.navbar .menu a');
        const currentPage = window.location.pathname.split('/').pop();

        let isDropdownActive = false;

        navLinks.forEach(link => { // Itera sobre todos os links
            const linkPage = link.getAttribute('href').split('/').pop();
            const parentDropdown = link.closest('.dropdown');

            link.classList.remove('active'); // Limpa a classe 'active' de todos os links primeiro

            // Trata o caso da página inicial (index.html ou /)
            if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
                link.classList.add('active');
                // Se o link ativo está dentro de um dropdown, marca o dropdown como ativo também
                if (parentDropdown) {
                    isDropdownActive = true;
                }
            }
        });

        // Adiciona a classe 'active' ao link do dropdown se um de seus filhos estiver ativo
        const dropdownToggle = document.querySelector('.dropdown-toggle');
        if (dropdownToggle) { // Garante que o elemento existe
            dropdownToggle.classList.toggle('active', isDropdownActive);
        }
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

        });
    };

    // Função para configurar o menu mobile (hambúrguer)
    const setupMobileMenu = () => {
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const menu = document.querySelector('.navbar .menu');
        const dropdownToggle = document.querySelector('.dropdown-toggle');

        if (!hamburgerBtn || !menu) return;

        hamburgerBtn.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('is-open');
            document.body.classList.toggle('menu-open', isOpen);
            hamburgerBtn.setAttribute('aria-expanded', isOpen);
            // Troca o ícone
            const icon = hamburgerBtn.querySelector('i');
            if (isOpen) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Comportamento do dropdown em mobile
        if (dropdownToggle) {
            dropdownToggle.addEventListener('click', (e) => {
                // Previne o comportamento padrão apenas em telas menores
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    const dropdownMenu = dropdownToggle.nextElementSibling;
                    // Alterna a visibilidade do submenu
                    const isVisible = dropdownMenu.style.display === 'flex';
                    dropdownMenu.style.display = isVisible ? 'none' : 'flex';
                }
            });
        }

        // Fecha o menu se um link for clicado
        menu.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && !e.target.classList.contains('dropdown-toggle')) {
                menu.classList.remove('is-open');
                document.body.classList.remove('menu-open');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                hamburgerBtn.querySelector('i').classList.remove('fa-xmark');
                hamburgerBtn.querySelector('i').classList.add('fa-bars');
            }
        });
    };

    // Carrega todos os componentes e depois dispara um evento
    const loadAllComponents = async () => {
        await Promise.all([
            loadComponent("header-placeholder", "data/header.html"),
            loadComponent("footer-placeholder", "data/footer.html"),
            loadComponent("alert-placeholder", "data/alert.html"),
            loadComponent("mural-placeholder", "data/mural.html") // Carrega apenas se o placeholder existir
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
    createBackToTopButton(); // Certifica-se de que esta função é chamada
});