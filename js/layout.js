document.addEventListener("DOMContentLoaded", () => {
    // Função para carregar um componente HTML num elemento placeholder
    const loadComponent = (elementId, filePath) => {
        const element = document.getElementById(elementId);
        if (element) {
            fetch(filePath)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
                    }
                    return response.text();
                })
                .then(data => {
                    element.innerHTML = data;
                    // Após carregar o header, executa a lógica para marcar o link ativo
                    if (elementId === 'header-placeholder') {
                        setActiveNavLink();
                    }
                })
                .catch(error => console.error(`Error loading component:`, error));
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

    // Carrega os componentes comuns
    loadComponent("header-placeholder", "data/header.html");
    // Se tiver outros placeholders, adicione-os aqui. Ex:
    // loadComponent("footer-placeholder", "layout/footer.html");
});