document.addEventListener('DOMContentLoaded', function() {
    // モバイルメニューの切り替え
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('overlay');
    const closeSidebarBtn = document.getElementById('closeSidebar');
    
    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', function() {
        sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
        document.body.classList.toggle('menu-open');
      });
    }
    
    if (closeSidebarBtn && sidebar) {
      closeSidebarBtn.addEventListener('click', function() {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    }
    
    if (overlay) {
      overlay.addEventListener('click', function() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    }
    
    // リサイズ時のハンドリング
    window.addEventListener('resize', function() {
      if (window.innerWidth > 768 && sidebar) {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });
  });
  
  // 2. コピーボタンの機能
  function setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    
    copyButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.preventDefault();
        const url = this.getAttribute('data-url') || this.getAttribute('data-text');
        
        if (url) {
          navigator.clipboard.writeText(url)
            .then(() => {
              const originalHTML = this.innerHTML;
              this.innerHTML = '<i class="fas fa-check"></i> コピーしました';
              this.classList.add('copied');
              
              setTimeout(() => {
                this.innerHTML = originalHTML;
                this.classList.remove('copied');
              }, 2000);
            })
            .catch(err => {
              console.error('コピーに失敗しました:', err);
            });
        }
      });
    });
  }
  
  // ページ読み込み時に実行
  document.addEventListener('DOMContentLoaded', function() {
    setupCopyButtons();
  });