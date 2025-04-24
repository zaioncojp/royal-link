/**
 * mobile-menu.js - モバイルメニュー機能
 * ROYAL LINK用のモバイル対応スクリプト
 */

document.addEventListener('DOMContentLoaded', function() {
    // 要素を取得
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('overlay');
    const closeSidebarBtn = document.getElementById('closeSidebar');
    const body = document.body;
    
    // モバイルメニューボタンのクリックイベント
    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', function() {
        sidebar.classList.toggle('active');
        
        if (overlay) {
          overlay.classList.toggle('active');
        }
        
        body.classList.toggle('menu-open');
      });
    }
    
    // サイドバー閉じるボタンのクリックイベント
    if (closeSidebarBtn && sidebar) {
      closeSidebarBtn.addEventListener('click', function() {
        sidebar.classList.remove('active');
        
        if (overlay) {
          overlay.classList.remove('active');
        }
        
        body.classList.remove('menu-open');
      });
    }
    
    // オーバーレイのクリックイベント
    if (overlay && sidebar) {
      overlay.addEventListener('click', function() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        body.classList.remove('menu-open');
      });
    }
    
    // リサイズ時の処理
    window.addEventListener('resize', function() {
      if (window.innerWidth > 992 && sidebar) {
        sidebar.classList.remove('active');
        
        if (overlay) {
          overlay.classList.remove('active');
        }
        
        body.classList.remove('menu-open');
      }
    });
    
    // サイドバー内のリンククリック時に自動的に閉じる（モバイル時のみ）
    const sidebarLinks = sidebar ? sidebar.querySelectorAll('a') : [];
    sidebarLinks.forEach(link => {
      link.addEventListener('click', function() {
        if (window.innerWidth <= 992) {
          sidebar.classList.remove('active');
          
          if (overlay) {
            overlay.classList.remove('active');
          }
          
          body.classList.remove('menu-open');
        }
      });
    });
    
    // テーブルのモバイル対応 - data-label属性を追加
    function addDataLabelsToTables() {
      const tables = document.querySelectorAll('table');
      
      tables.forEach(table => {
        const headerCells = table.querySelectorAll('thead th');
        const headerTexts = [];
        
        // ヘッダーテキストを収集
        headerCells.forEach(cell => {
          headerTexts.push(cell.textContent.trim());
        });
        
        // 各行のセルにdata-label属性を追加
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell, index) => {
            if (index < headerTexts.length) {
              cell.setAttribute('data-label', headerTexts[index]);
            }
          });
        });
      });
    }
    
    // テーブル対応の実行
    addDataLabelsToTables();
    
    // コピーボタン機能
    const setupCopyButtons = function() {
      const copyButtons = document.querySelectorAll('.copy-btn');
      
      copyButtons.forEach(button => {
        button.addEventListener('click', function(e) {
          e.preventDefault();
          
          // コピーするテキストを取得
          const url = this.getAttribute('data-url') || this.getAttribute('data-text');
          
          if (url) {
            navigator.clipboard.writeText(url)
              .then(() => {
                // コピー成功時の表示
                const originalHTML = this.innerHTML;
                this.innerHTML = '<i class="fas fa-check"></i> コピーしました';
                this.classList.add('copied');
                
                // 元に戻す
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
    };
    
    // コピーボタン機能の実行
    setupCopyButtons();
    
    // タブ切り替え機能
    const setupTabs = function() {
      const tabButtons = document.querySelectorAll('.tab-btn');
      
      tabButtons.forEach(button => {
        button.addEventListener('click', function() {
          // 同じグループ内のタブを取得
          const tabsContainer = this.closest('.tabs');
          const tabs = tabsContainer ? tabsContainer.querySelectorAll('.tab-btn') : [];
          
          // タブパネルのIDを取得
          const tabId = this.getAttribute('data-tab');
          const tabPanelId = tabId ? `${tabId}-tab` : null;
          
          if (tabPanelId) {
            // すべてのタブとパネルからアクティブクラスを削除
            tabs.forEach(tab => tab.classList.remove('active'));
            const panels = document.querySelectorAll('.tab-panel');
            panels.forEach(panel => panel.classList.remove('active'));
            
            // クリックされたタブとそのパネルをアクティブに
            this.classList.add('active');
            const targetPanel = document.getElementById(tabPanelId);
            if (targetPanel) {
              targetPanel.classList.add('active');
            }
          }
        });
      });
    };
    
    // タブ機能の実行
    setupTabs();
  });