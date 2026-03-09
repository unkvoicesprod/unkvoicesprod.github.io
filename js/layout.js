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

        navLinks.forEach(link => { // Itera sobre todos os links
            const linkPage = link.getAttribute('href').split('/').pop();

            link.classList.remove('active'); // Limpa a classe 'active' de todos os links primeiro

            // Trata o caso da página inicial (index.html ou /)
            if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
                link.classList.add('active');
            }
        });
    };

    // Função para controlar a aparência do header ao rolar
    const handleHeaderScroll = () => {
        const header = document.querySelector('header');
        if (!header) return;

        window.addEventListener('scroll', () => {
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

        // Fecha o menu se um link for clicado
        menu.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                menu.classList.remove('is-open');
                document.body.classList.remove('menu-open');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                hamburgerBtn.querySelector('i').classList.remove('fa-xmark');
                hamburgerBtn.querySelector('i').classList.add('fa-bars');
            }
        });
    };

    const setupHeroTypingEffect = () => {
        const descriptions = document.querySelectorAll('.hero p');
        if (!descriptions.length) return;

        descriptions.forEach((element, index) => {
            const fullText = element.innerText || element.textContent || '';
            if (!fullText.trim()) return;

            element.textContent = '';
            element.classList.add('typing-caret');

            const speed = window.innerWidth <= 768 ? 16 : 22;
            const delay = 220 + (index * 120);
            let currentIndex = 0;

            const typeNextCharacter = () => {
                if (currentIndex < fullText.length) {
                    element.textContent += fullText.charAt(currentIndex);
                    currentIndex += 1;
                    setTimeout(typeNextCharacter, speed);
                } else {
                    element.classList.remove('typing-caret');
                }
            };

            setTimeout(typeNextCharacter, delay);
        });
    };

    // Carrega todos os componentes e depois dispara um evento
    const loadAllComponents = async () => {
        await Promise.all([
            loadComponent("header-placeholder", "data/header.html"),
            loadComponent("footer-placeholder", "data/footer.html"),
            loadComponent("alert-placeholder", "data/alert.html")
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
    setupHeroTypingEffect();
    createBackToTopButton(); // Certifica-se de que esta função é chamada
});
