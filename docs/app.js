class App {
    constructor() {
        this.videoList = null;
        this.videos = [];
        this.filteredVideos = [];
        this.currentPage = 0;
        this.pageSize = 12;
        this.currentSort = 'time-desc';
        this.selectedYear = '';
        this.baseUrl = '';
        this.commentsCache = {};
        this.searchResults = [];
        this.searchPage = 0;
        this.searchPageSize = 20;
        this.carouselImages = null;
        this.carouselIndex = 0;
        this.currentComments = [];
        this.commentsPage = 0;
        this.commentsPageSize = 35;
        this.currentVideo = null;
        this.isSearching = false;
        this.currentSecUid = '';
        
        this.init();
    }
    
    setUserHeader(user) {
        const nickname = user.nickname || '用户';
        document.title = `${nickname}。`;
        document.getElementById('header-title').textContent = nickname;
        
        const avatarUrl = `data/${user.sec_uid}/avatar.jpeg`;
        const avatarEl = document.getElementById('header-avatar');
        avatarEl.src = avatarUrl;
        document.getElementById('favicon').href = avatarUrl;
        
        avatarEl.onerror = () => {
            avatarEl.src = this.getPlaceholderSvg('avatar');
        };
    }
    
    getFullUrl(path) {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
            return path;
        }
        return this.baseUrl + path;
    }
    
    getPlaceholderSvg(type) {
        const svgs = {
            thumb: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23e0e0e0%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22>无图片</text></svg>`,
            avatar: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22><rect fill=%22%23ddd%22 width=%2228%22 height=%2228%22/><text x=%2214%22 y=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2210%22>?</text></svg>`
        };
        return svgs[type] || '';
    }
    
    formatDateTime(video) {
        if (video.create_time) {
            const date = new Date(video.create_time * 1000);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${month}月${day}日 ${hours}:${minutes}`;
        }
        if (video.create_time_str) {
            const parts = video.create_time_str.split(' ');
            if (parts.length === 2) {
                const dateParts = parts[0].split('-');
                if (dateParts.length === 3) {
                    return `${dateParts[1]}/${dateParts[2]} ${parts[1]}`;
                }
            }
            return video.create_time_str;
        }
        return '';
    }
    
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(parseInt(timestamp) * 1000);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${month}月${day}日 ${hours}:${minutes}`;
    }
    
    createPaginationHtml(currentPage, totalPages, totalCount, callbackTemplate) {
        if (totalPages <= 1) return '';
        
        let html = `<div class="pagination-info">第 ${currentPage + 1}/${totalPages} 页 (共 ${totalCount} 条)</div>`;
        html += '<div class="pagination-btns">';
        
        if (currentPage > 0) {
            const prevCallback = callbackTemplate.replace(/\$\{page\}/g, currentPage - 1);
            html += `<button class="page-btn" onclick="app.${prevCallback}">上一页</button>`;
        }
        
        const maxButtons = 5;
        let startPage = Math.max(0, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages - 1, startPage + maxButtons - 1);
        
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(0, endPage - maxButtons + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                html += `<button class="page-btn active">${i + 1}</button>`;
            } else {
                const pageCallback = callbackTemplate.replace(/\$\{page\}/g, i);
                html += `<button class="page-btn" onclick="app.${pageCallback}">${i + 1}</button>`;
            }
        }
        
        if (currentPage < totalPages - 1) {
            const nextCallback = callbackTemplate.replace(/\$\{page\}/g, currentPage + 1);
            html += `<button class="page-btn" onclick="app.${nextCallback}">下一页</button>`;
        }
        
        html += '</div>';
        return html;
    }
    
    async init() {
        this.bindEvents();
        await this.loadData();
    }
    
    bindEvents() {
        document.getElementById('search-btn').addEventListener('click', () => this.search());
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });
        
        document.getElementById('search-close-btn').addEventListener('click', () => this.closeSearchResults());
        
        this.initCustomSelects();
        
        document.getElementById('load-more-btn').addEventListener('click', () => this.loadMore());
        
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('video-modal').addEventListener('click', (e) => {
            if (e.target.id === 'video-modal') this.closeModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeSearchResults();
                this.closeAllCustomSelects();
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select')) {
                this.closeAllCustomSelects();
            }
        });
    }
    
    initCustomSelects() {
        document.querySelectorAll('.custom-select').forEach(select => {
            const trigger = select.querySelector('.custom-select-trigger');
            const options = select.querySelectorAll('.custom-select-option');
            
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = select.classList.contains('open');
                this.closeAllCustomSelects();
                if (!isOpen) {
                    select.classList.add('open');
                }
            });
            
            options.forEach(option => {
                option.addEventListener('click', () => {
                    const value = option.dataset.value;
                    const text = option.textContent;
                    
                    select.querySelectorAll('.custom-select-option').forEach(opt => opt.classList.remove('active'));
                    option.classList.add('active');
                    
                    trigger.querySelector('span').textContent = text;
                    trigger.dataset.value = value;
                    
                    select.classList.remove('open');
                    
                    this.handleSelectChange(select.id, value);
                });
            });
        });
    }
    
    closeAllCustomSelects() {
        document.querySelectorAll('.custom-select').forEach(select => {
            select.classList.remove('open');
        });
    }
    
    handleSelectChange(selectId, value) {
        if (selectId === 'search-type-wrapper') {
            return;
        }
        
        if (selectId === 'sort-select-wrapper') {
            this.currentSort = value;
            this.sortVideos();
            this.renderVideos(true);
        }
        
        if (selectId === 'year-select-wrapper') {
            this.selectedYear = value;
            this.applyFilters();
        }
    }
    
    async loadData() {
        try {
            const usersIndexRes = await fetch('data/users_index.json');
            const usersIndex = await usersIndexRes.json();
            
            if (!usersIndex.users || usersIndex.users.length === 0) {
                throw new Error('没有找到用户数据');
            }
            
            const firstUser = usersIndex.users[0];
            this.currentSecUid = firstUser.sec_uid;
            
            this.setUserHeader(firstUser);
            
            const videoListRes = await fetch(`data/${firstUser.sec_uid}/video_list.json`);
            
            this.videoList = await videoListRes.json();
            
            this.baseUrl = this.videoList.base_url || '';
            this.videos = this.videoList.videos || [];
            this.filteredVideos = [...this.videos];
            
            this.generateYearOptions();
            this.updateStats();
            this.sortVideos();
            this.renderVideos(true);
            
            await this.loadSummary();
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('video-grid').style.display = 'grid';
            
        } catch (error) {
            console.error('加载数据失败:', error);
            document.getElementById('loading').innerHTML = `
                <p style="color: var(--primary-color);">加载数据失败，请确保数据文件存在</p>
                <p style="color: var(--text-secondary); margin-top: 10px;">错误信息: ${error.message}</p>
            `;
        }
    }
    
    generateYearOptions() {
        const years = new Set();
        this.videos.forEach(video => {
            if (video.create_time) {
                const date = new Date(video.create_time * 1000);
                years.add(date.getFullYear());
            }
        });
        
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        const yearOptions = document.getElementById('year-options');
        
        sortedYears.forEach(year => {
            const option = document.createElement('div');
            option.className = 'custom-select-option';
            option.dataset.value = year;
            option.textContent = `${year}年`;
            option.addEventListener('click', () => {
                const wrapper = document.getElementById('year-select-wrapper');
                wrapper.querySelectorAll('.custom-select-option').forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                wrapper.querySelector('.custom-select-trigger span').textContent = `${year}年`;
                wrapper.querySelector('.custom-select-trigger').dataset.value = year;
                wrapper.classList.remove('open');
                this.selectedYear = year;
                this.applyFilters();
            });
            yearOptions.appendChild(option);
        });
    }
    
    async loadSummary() {
        try {
            const response = await fetch(`data/${this.videoList.sec_uid}/summary.json`);
            const summary = await response.json();
            document.getElementById('generated-time').textContent = summary.generated_at;
            
            if (summary.active_repliers && summary.active_repliers.length > 0) {
                const shuffled = [...summary.active_repliers].sort(() => Math.random() - 0.5).slice(0, 3);
                this.renderActiveRepliers(shuffled);
            }
        } catch (error) {
            console.error('加载摘要失败:', error);
        }
    }
    
    formatNumber(num) {
        if (!num) return '0';
        num = parseInt(num);
        if (num >= 10000) {
            const wan = num / 10000;
            return wan >= 10 ? `${Math.round(wan)}万` : `${wan.toFixed(1).replace(/\.0$/, '')}万`;
        }
        return num.toString();
    }
    
    updateStats() {
        document.getElementById('total-videos').textContent = this.formatNumber(this.videoList.total_videos);
        document.getElementById('total-comments').textContent = this.formatNumber(this.videoList.total_comments);
    }
    
    renderActiveRepliers(repliers) {
        const statsEl = document.getElementById('stats');
        let container = document.getElementById('active-repliers');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'active-repliers';
            container.className = 'active-repliers';
            statsEl.appendChild(container);
        }
        
        const avatarPlaceholder = this.getPlaceholderSvg('avatar');
        
        container.innerHTML = `
            <div class="repliers-label">活跃用户</div>
            <div class="repliers-avatars">
                ${repliers.map(r => `
                    <div class="replier-item" onclick="app.showReplierPopover(this, '${this.escapeJsString(r.nickname)}', ${r.count})">
                        <img class="replier-avatar" src="${r.avatar ? this.getFullUrl(r.avatar) : avatarPlaceholder}" 
                             alt="${this.escapeHtml(r.nickname)}" 
                             onerror="this.src='${avatarPlaceholder}'">
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    showReplierPopover(element, nickname, count) {
        this.hideReplierPopover();
        
        const popover = document.createElement('div');
        popover.className = 'replier-popover';
        popover.innerHTML = `
            <div class="replier-popover-name" onclick="app.searchByNickname('${this.escapeJsString(nickname)}')">${this.escapeHtml(nickname)}</div>
            <div class="replier-popover-count">${count} 条回复</div>
        `;
        
        element.appendChild(popover);
        element.classList.add('active');
        
        const popoverRect = popover.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        
        if (popoverRect.left < 10) {
            popover.style.left = '0';
            popover.style.transform = 'translateX(0)';
            popover.classList.add('arrow-left');
        } else if (popoverRect.right > windowWidth - 10) {
            popover.style.left = 'auto';
            popover.style.right = '0';
            popover.style.transform = 'none';
            popover.classList.add('arrow-right');
        }
        
        setTimeout(() => {
            document.addEventListener('click', this._replierPopoverHandler = (e) => {
                if (!element.contains(e.target)) {
                    this.hideReplierPopover();
                }
            });
        }, 0);
    }
    
    searchByNickname(nickname) {
        this.hideReplierPopover();
        document.querySelector('#search-type-wrapper .custom-select-trigger').dataset.value = 'nickname';
        document.querySelector('#search-type-wrapper .custom-select-trigger span').textContent = '昵称';
        document.getElementById('search-input').value = nickname;
        this.search();
    }
    
    hideReplierPopover() {
        document.querySelectorAll('.replier-item.active').forEach(el => {
            el.classList.remove('active');
            const popover = el.querySelector('.replier-popover');
            if (popover) popover.remove();
        });
        if (this._replierPopoverHandler) {
            document.removeEventListener('click', this._replierPopoverHandler);
            this._replierPopoverHandler = null;
        }
    }
    
    async search() {
        const searchType = document.querySelector('#search-type-wrapper .custom-select-trigger').dataset.value;
        const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
        
        if (!searchQuery) {
            this.closeSearchResults();
            return;
        }
        
        if (this.isSearching) return;
        this.isSearching = true;
        
        this.showSearchProgress(0, this.videos.length);
        
        const results = [];
        const batchSize = 10;
        
        for (let i = 0; i < this.videos.length; i += batchSize) {
            const batch = this.videos.slice(i, i + batchSize);
            const batchPromises = batch.map(async (video) => {
                const awemeId = video.aweme_id;
                const comments = await this.loadComments(awemeId);
                const videoResults = [];
                
                for (const comment of comments) {
                    const matchField = searchType === 'nickname' ? comment.user_nickname : comment.text;
                    if ((matchField || '').toLowerCase().includes(searchQuery)) {
                        videoResults.push({
                            type: 'comment',
                            awemeId,
                            videoTitle: video.desc || '',
                            cid: comment.cid,
                            userNickname: comment.user_nickname,
                            text: comment.text
                        });
                    }
                    
                    for (const reply of comment.replies || []) {
                        const replyMatchField = searchType === 'nickname' ? reply.user_nickname : reply.text;
                        if ((replyMatchField || '').toLowerCase().includes(searchQuery)) {
                            videoResults.push({
                                type: 'reply',
                                awemeId,
                                videoTitle: video.desc || '',
                                parentCid: comment.cid,
                                cid: reply.cid,
                                userNickname: reply.user_nickname,
                                text: reply.text
                            });
                        }
                    }
                }
                return videoResults;
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.flat());
            
            this.showSearchProgress(Math.min(i + batchSize, this.videos.length), this.videos.length);
        }
        
        this.isSearching = false;
        this.searchResults = results;
        this.searchPage = 0;
        this.showSearchResults(searchQuery);
    }
    
    showSearchProgress(current, total) {
        const container = document.getElementById('search-results');
        const list = document.getElementById('search-results-list');
        const count = document.getElementById('search-count');
        const pagination = document.getElementById('search-pagination');
        
        container.style.display = 'block';
        count.textContent = '...';
        list.innerHTML = `<div class="search-result-item" style="text-align:center;color:var(--text-secondary);padding:20px;">
            正在搜索中... ${current}/${total} 个作品
        </div>`;
        pagination.innerHTML = '';
    }
    
    showSearchResults(query) {
        const container = document.getElementById('search-results');
        const list = document.getElementById('search-results-list');
        const count = document.getElementById('search-count');
        const pagination = document.getElementById('search-pagination');
        
        const totalResults = this.searchResults.length;
        const totalPages = Math.ceil(totalResults / this.searchPageSize);
        
        count.textContent = totalResults;
        
        if (totalResults === 0) {
            list.innerHTML = '<div class="search-result-item" style="text-align:center;color:var(--text-secondary);">没有找到匹配结果</div>';
            pagination.innerHTML = '';
        } else {
            const start = this.searchPage * this.searchPageSize;
            const end = start + this.searchPageSize;
            const pageResults = this.searchResults.slice(start, end);
            
            list.innerHTML = pageResults.map(result => `
                <div class="search-result-item" data-aweme-id="${result.awemeId}" data-cid="${result.cid}" data-parent-cid="${result.parentCid || ''}" data-type="${result.type}">
                    <div class="search-result-video">
                        <span class="search-result-type ${result.type}">${result.type === 'comment' ? '评论' : '回复'}</span>
                        <span class="search-result-video-title">${this.escapeHtml(result.videoTitle || '无标题')}</span>
                    </div>
                    <div class="search-result-content">
                        <span class="search-result-user">${this.escapeHtml(result.userNickname || '匿名')} ：</span>
                        <span class="search-result-text">${this.highlightText(this.escapeHtml(result.text || ''), query)}</span>
                    </div>
                </div>
            `).join('');
            
            list.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => this.onSearchResultClick(item));
            });
            
            if (totalPages > 1) {
                pagination.innerHTML = this.createPaginationHtml(this.searchPage, totalPages, totalResults, `goToSearchPage(\${page}, '${this.escapeJsString(query)}')`);
            } else {
                pagination.innerHTML = '';
            }
        }
        
        container.style.display = 'block';
    }
    
    goToSearchPage(page, query) {
        this.searchPage = page;
        this.showSearchResults(query);
        document.getElementById('search-results-list').scrollTop = 0;
    }
    
    highlightText(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }
    
    closeSearchResults() {
        document.getElementById('search-results').style.display = 'none';
    }
    
    async onSearchResultClick(item) {
        const awemeId = item.dataset.awemeId;
        const cid = item.dataset.cid;
        const parentCid = item.dataset.parentCid;
        const type = item.dataset.type;
        
        const video = this.videos.find(v => v.aweme_id === awemeId);
        if (!video) return;
        
        await this.openModal(video, cid, parentCid, type);
    }
    
    async loadComments(awemeId) {
        if (this.commentsCache[awemeId]) {
            return this.commentsCache[awemeId];
        }
        
        try {
            const response = await fetch(`data/${this.videoList.sec_uid}/comments/${awemeId}.json`);
            const data = await response.json();
            this.commentsCache[awemeId] = data.comments || [];
            return this.commentsCache[awemeId];
        } catch (error) {
            console.error('加载评论失败:', error);
            return [];
        }
    }
    
    applyFilters() {
        this.filteredVideos = this.videos.filter(video => {
            if (this.selectedYear) {
                const videoYear = new Date(video.create_time * 1000).getFullYear();
                if (videoYear !== parseInt(this.selectedYear)) {
                    return false;
                }
            }
            return true;
        });
        
        this.sortVideos();
        this.renderVideos(true);
        this.updateFilterInfo();
    }
    
    updateFilterInfo() {
        const filterInfo = document.getElementById('filter-info');
        
        if (this.selectedYear) {
            filterInfo.textContent = `筛选: ${this.selectedYear}年 | 共 ${this.filteredVideos.length} 个作品`;
            filterInfo.style.display = 'block';
        } else {
            filterInfo.style.display = 'none';
        }
    }
    
    sortVideos() {
        const sortFunctions = {
            'time-desc': (a, b) => (b.create_time || 0) - (a.create_time || 0),
            'time-asc': (a, b) => (a.create_time || 0) - (b.create_time || 0),
            'comments-desc': (a, b) => (b.comment_count || 0) - (a.comment_count || 0)
        };
        
        this.filteredVideos.sort(sortFunctions[this.currentSort] || sortFunctions['time-desc']);
    }
    
    renderVideos(reset = false) {
        const grid = document.getElementById('video-grid');
        
        if (reset) {
            grid.innerHTML = '';
            this.currentPage = 0;
        }
        
        const start = this.currentPage * this.pageSize;
        const end = start + this.pageSize;
        const videosToShow = this.filteredVideos.slice(start, end);
        
        if (videosToShow.length === 0 && this.currentPage === 0) {
            grid.innerHTML = `
                <div class="no-results">
                    <p>没有找到匹配的作品</p>
                </div>
            `;
            document.getElementById('load-more').style.display = 'none';
            return;
        }
        
        videosToShow.forEach(video => {
            const card = this.createVideoCard(video);
            grid.appendChild(card);
        });
        
        this.currentPage++;
        
        const loadMore = document.getElementById('load-more');
        if (end < this.filteredVideos.length) {
            loadMore.style.display = 'block';
        } else {
            loadMore.style.display = 'none';
        }
    }
    
    createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.onclick = () => this.openModal(video);
        
        const rawThumbUrl = video.thumb && video.thumb.length > 0 
            ? video.thumb[0] 
            : (video.images && video.images.length > 0 ? video.images[0] : '');
        const thumbUrl = this.getFullUrl(rawThumbUrl);
        
        const imageCount = video.images ? video.images.length : 0;
        
        const title = video.desc ? video.desc.trim() : '';
        const displayTitle = title || '无题';
        const dateTimeStr = this.formatDateTime(video);
        
        card.innerHTML = `
            <div class="video-thumbnail">
                ${thumbUrl ? `<img src="${thumbUrl}" alt="封面" loading="lazy" onerror="this.src='${this.getPlaceholderSvg('thumb')}'">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">无图片</div>'}
                ${imageCount > 1 ? `<span class="image-count">🖼️ ${imageCount}</span>` : ''}
            </div>
            <div class="video-info">
                <div class="video-title">${this.escapeHtml(displayTitle)}</div>
                <div class="video-meta">
                    <span class="video-date-time">${dateTimeStr || '未知时间'}</span>
                    <span class="video-comments">💬 ${video.comment_count || 0}</span>
                </div>
            </div>
        `;
        
        return card;
    }
    
    async openModal(video, highlightCid = null, parentCid = null, highlightType = null) {
        const modal = document.getElementById('video-modal');
        const modalBody = document.getElementById('modal-body');
        
        let imagesHtml = '';
        let displayImages = [];
        
        if (video.images && video.images.length > 0) {
            displayImages = video.images.map(img => this.getFullUrl(img));
        } else if (video.thumb) {
            if (Array.isArray(video.thumb)) {
                displayImages = video.thumb.map(img => this.getFullUrl(img));
            } else {
                displayImages = [this.getFullUrl(video.thumb)];
            }
        }
        
        const isMobile = window.innerWidth <= 768;
        
        if (displayImages.length > 0) {
            const thumbPlaceholder = this.getPlaceholderSvg('thumb');
            if (displayImages.length > 1) {
                imagesHtml = `
                    <div class="image-carousel" id="image-carousel">
                        <div class="carousel-container" id="carousel-container">
                            ${displayImages.map((img, index) => `
                                <img src="${img}" alt="图片${index + 1}" loading="lazy" onerror="this.src='${thumbPlaceholder}'" onclick="app.openImageViewer(${JSON.stringify(displayImages).replace(/"/g, '&quot;')}, ${index})">
                            `).join('')}
                        </div>
                        <button class="carousel-nav prev" onclick="app.carouselPrev()">‹</button>
                        <button class="carousel-nav next" onclick="app.carouselNext()">›</button>
                    </div>
                    <div class="carousel-dots">
                        ${displayImages.map((_, index) => `
                            <button class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="app.carouselGoTo(${index})"></button>
                        `).join('')}
                    </div>
                `;
                this.carouselImages = displayImages;
                this.carouselIndex = 0;
            } else {
                imagesHtml = `
                    <div class="modal-images">
                        <img src="${displayImages[0]}" alt="图片1" loading="lazy" onerror="this.src='${thumbPlaceholder}'" onclick="app.openImageViewer(${JSON.stringify(displayImages).replace(/"/g, '&quot;')}, 0)">
                    </div>
                `;
            }
        }
        
        modalBody.innerHTML = `
            ${imagesHtml}
            <div class="modal-desc">${this.escapeHtml(video.desc || '无描述')}</div>
            <div class="modal-meta">
                <span>📅 时间: ${this.formatDateTime(video)}</span>
                <span>💬 评论数: ${video.comment_count || 0}</span>
            </div>
            <div class="comments-section">
                <h3 class="comments-title">💬 评论加载中...</h3>
            </div>
        `;
        
        modal.classList.add('active');
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${scrollbarWidth}px`;
        
        const comments = await this.loadComments(video.aweme_id);
        
        this.currentComments = comments || [];
        this.commentsPage = 0;
        this.currentVideo = video;
        
        this.renderComments(highlightCid, parentCid, highlightType);
    }
    
    renderComments(highlightCid = null, parentCid = null, highlightType = null) {
        const modalBody = document.getElementById('modal-body');
        const totalComments = this.currentComments.length;
        const totalPages = Math.ceil(totalComments / this.commentsPageSize);
        
        const hotCommentsCount = Math.min(5, Math.ceil(totalComments * 0.15));
        
        const sortedComments = this.getSortedComments(this.currentComments, hotCommentsCount);
        
        if (highlightCid && this.commentsPage === 0) {
            let targetPage = 0;
            for (let i = 0; i < sortedComments.length; i++) {
                const comment = sortedComments[i];
                if (highlightType === 'comment' && comment.cid === highlightCid) {
                    targetPage = Math.floor(i / this.commentsPageSize);
                    break;
                }
                if (highlightType === 'reply' && parentCid === comment.cid) {
                    targetPage = Math.floor(i / this.commentsPageSize);
                    break;
                }
            }
            this.commentsPage = targetPage;
        }
        
        let commentsHtml = '';
        if (totalComments > 0) {
            const start = this.commentsPage * this.commentsPageSize;
            const end = start + this.commentsPageSize;
            const pageComments = sortedComments.slice(start, end);
            
            commentsHtml = `
                <div class="comments-section">
                    <h3 class="comments-title">💬 评论 (${totalComments})</h3>
                    ${pageComments.map((comment, index) => {
                        const globalIndex = start + index;
                        const isHot = globalIndex < hotCommentsCount;
                        return this.createCommentHtml(comment, highlightCid, parentCid, highlightType, isHot);
                    }).join('')}
                    ${totalPages > 1 ? this.createCommentsPagination(totalPages, totalComments) : ''}
                </div>
            `;
        } else {
            commentsHtml = `
                <div class="comments-section">
                    <h3 class="comments-title">💬 评论 (0)</h3>
                    <p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无评论</p>
                </div>
            `;
        }
        
        const commentsSection = modalBody.querySelector('.comments-section');
        if (commentsSection) {
            commentsSection.outerHTML = commentsHtml;
        }
        
        if (highlightCid) {
            setTimeout(() => {
                let highlightElement;
                if (highlightType === 'reply' && parentCid) {
                    highlightElement = document.getElementById(`reply-${highlightCid}`);
                    if (!highlightElement) {
                        highlightElement = document.getElementById(`comment-${parentCid}`);
                    }
                } else {
                    highlightElement = document.getElementById(`comment-${highlightCid}`);
                }
                
                if (highlightElement) {
                    highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightElement.style.background = '#fff3cd';
                    setTimeout(() => {
                        highlightElement.style.background = '';
                    }, 3000);
                }
            }, 300);
        }
    }
    
    getSortedComments(comments, hotCount) {
        const commentsCopy = [...comments];
        
        const sortedByReply = commentsCopy.sort((a, b) => {
            const replyA = (a.reply_count || 0);
            const replyB = (b.reply_count || 0);
            return replyB - replyA;
        });
        
        const hotComments = sortedByReply.slice(0, hotCount);
        const hotCids = new Set(hotComments.map(c => c.cid));
        
        const remainingComments = comments.filter(c => !hotCids.has(c.cid));
        remainingComments.sort((a, b) => {
            const timeA = parseInt(a.create_time) || 0;
            const timeB = parseInt(b.create_time) || 0;
            return timeB - timeA;
        });
        
        return [...hotComments, ...remainingComments];
    }
    
    createCommentsPagination(totalPages, totalComments) {
        const paginationInner = this.createPaginationHtml(this.commentsPage, totalPages, totalComments, 'goToCommentsPage(${page})');
        return `<div class="comments-pagination">${paginationInner}</div>`;
    }
    
    goToCommentsPage(page) {
        this.commentsPage = page;
        this.renderComments();
        document.querySelector('.comments-section').scrollIntoView({ behavior: 'smooth' });
    }
    
    createCommentHtml(comment, highlightCid = null, parentCid = null, highlightType = null, isHot = false) {
        const repliesCount = comment.replies ? comment.replies.length : 0;
        const isHighlighted = highlightCid === comment.cid && highlightType === 'comment';
        const shouldExpandReplies = highlightType === 'reply' && parentCid === comment.cid;
        
        const emptyTextPlaceholder = '<span class="empty-text">[信息为图片或表情 系统未保存]</span>';
        const avatarPlaceholder = this.getPlaceholderSvg('avatar');
        
        let repliesHtml = '';
        
        if (comment.replies && comment.replies.length > 0) {
            const sortedReplies = [...comment.replies].sort((a, b) => {
                const timeA = parseInt(a.create_time) || 0;
                const timeB = parseInt(b.create_time) || 0;
                return timeA - timeB;
            });
            
            repliesHtml = `
                <div class="replies-section">
                    ${sortedReplies.map(reply => {
                        const isReplyHighlighted = highlightType === 'reply' && highlightCid === reply.cid;
                        const replyText = reply.text ? this.escapeHtml(reply.text) : emptyTextPlaceholder;
                        return `
                            <div class="reply-item" id="reply-${reply.cid}" style="${isReplyHighlighted ? 'background: #fff3cd;' : ''}">
                                <div class="reply-header">
                                    ${reply.user_avatar ? `<img class="reply-avatar" src="${this.getFullUrl(reply.user_avatar)}" alt="头像" onerror="this.src='${avatarPlaceholder}'">` : ''}
                                    <div class="reply-user">
                                        <div class="reply-user-row">
                                            <span class="reply-user-info">
                                                <span class="reply-nickname copyable" onclick="app.copyToClipboard('${this.escapeJsString(reply.user_nickname || '匿名')}', this)">${this.escapeHtml(reply.user_nickname || '匿名')}</span>
                                                ${reply.ip_label ? `<span class="reply-ip">${reply.ip_label}</span>` : ''}
                                            </span>
                                            ${reply.reply_to_username ? `<span class="reply-to">回复 @<span class="copyable" onclick="app.copyToClipboard('${this.escapeJsString(reply.reply_to_username)}', this)">${this.escapeHtml(reply.reply_to_username)}</span></span>` : ''}
                                        </div>
                                        <span class="reply-time">${this.formatTimestamp(reply.create_time)}</span>
                                    </div>
                                </div>
                                <div class="reply-text">${replyText}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        const commentText = comment.text ? this.escapeHtml(comment.text) : emptyTextPlaceholder;
        
        return `
            <div class="comment-item ${isHot ? 'hot-comment' : ''}" id="comment-${comment.cid}" style="${isHighlighted ? 'background: #fff3cd;' : ''}">
                <div class="comment-header">
                    ${comment.user_avatar ? `<img class="comment-avatar" src="${this.getFullUrl(comment.user_avatar)}" alt="头像" onerror="this.src='${avatarPlaceholder}'">` : ''}
                    <div class="comment-user">
                        <div class="comment-user-row">
                            <span class="comment-user-info">
                                <span class="comment-nickname copyable" onclick="app.copyToClipboard('${this.escapeJsString(comment.user_nickname || '匿名')}', this)">${this.escapeHtml(comment.user_nickname || '匿名')}</span>
                                ${comment.ip_label ? `<span class="comment-ip">${comment.ip_label}</span>` : ''}
                            </span>
                        </div>
                        <span class="comment-time">${this.formatTimestamp(comment.create_time)}</span>
                    </div>
                </div>
                <div class="comment-text">${commentText}</div>
                ${repliesCount > 0 ? `
                    <div class="replies-toggle-wrapper">
                        <span class="replies-toggle" onclick="app.toggleReplies(this)">
                            展开 ${repliesCount} 条回复
                        </span>
                    </div>
                    <div class="replies-container" style="display:${shouldExpandReplies ? 'block' : 'none'};">
                        ${repliesHtml}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    toggleReplies(toggle) {
        const container = toggle.parentElement.nextElementSibling;
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
    }
    
    copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = '已复制';
            element.classList.add('copied');
            setTimeout(() => {
                element.textContent = originalText;
                element.classList.remove('copied');
            }, 1000);
        }).catch(err => {
            console.error('复制失败:', err);
        });
    }
    
    closeModal() {
        const modal = document.getElementById('video-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
    
    openImageViewer(images, index) {
        this.viewerImages = images;
        this.viewerIndex = index;
        
        const thumbPlaceholder = this.getPlaceholderSvg('thumb');
        
        let viewer = document.getElementById('image-viewer');
        if (!viewer) {
            viewer = document.createElement('div');
            viewer.id = 'image-viewer';
            viewer.className = 'image-viewer';
            viewer.innerHTML = `
                <button class="image-viewer-close" onclick="event.stopPropagation(); app.closeImageViewer()">&times;</button>
                <button class="image-nav prev" onclick="event.stopPropagation(); app.prevImage()"></button>
                <img id="viewer-image" src="" alt="图片预览" onerror="this.src='${thumbPlaceholder}'" onclick="event.stopPropagation(); app.closeImageViewer()">
                <button class="image-nav next" onclick="event.stopPropagation(); app.nextImage()"></button>
            `;
            viewer.addEventListener('click', () => this.closeImageViewer());
            document.body.appendChild(viewer);
        }
        
        const viewerImg = document.getElementById('viewer-image');
        viewerImg.src = images[index];
        viewerImg.onerror = () => { viewerImg.src = thumbPlaceholder; };
        viewer.classList.add('active');
        
        const prevBtn = viewer.querySelector('.image-nav.prev');
        const nextBtn = viewer.querySelector('.image-nav.next');
        const hasMultiple = images.length > 1;
        prevBtn.style.display = hasMultiple ? 'flex' : 'none';
        nextBtn.style.display = hasMultiple ? 'flex' : 'none';
    }
    
    closeImageViewer() {
        const viewer = document.getElementById('image-viewer');
        if (viewer) {
            viewer.classList.remove('active');
        }
    }
    
    prevImage() {
        this.viewerIndex = (this.viewerIndex - 1 + this.viewerImages.length) % this.viewerImages.length;
        const img = document.getElementById('viewer-image');
        img.src = this.viewerImages[this.viewerIndex];
        img.onerror = () => { img.src = this.getPlaceholderSvg('thumb'); };
    }
    
    nextImage() {
        this.viewerIndex = (this.viewerIndex + 1) % this.viewerImages.length;
        const img = document.getElementById('viewer-image');
        img.src = this.viewerImages[this.viewerIndex];
        img.onerror = () => { img.src = this.getPlaceholderSvg('thumb'); };
    }
    
    carouselPrev() {
        if (!this.carouselImages) return;
        this.carouselIndex = (this.carouselIndex - 1 + this.carouselImages.length) % this.carouselImages.length;
        this.updateCarousel();
    }
    
    carouselNext() {
        if (!this.carouselImages) return;
        this.carouselIndex = (this.carouselIndex + 1) % this.carouselImages.length;
        this.updateCarousel();
    }
    
    carouselGoTo(index) {
        this.carouselIndex = index;
        this.updateCarousel();
    }
    
    updateCarousel() {
        const container = document.getElementById('carousel-container');
        if (container) {
            container.style.transform = `translateX(-${this.carouselIndex * 100}%)`;
        }
        document.querySelectorAll('.carousel-dot').forEach((dot, index) => {
            dot.classList.toggle('active', index === this.carouselIndex);
        });
    }
    
    loadMore() {
        this.renderVideos();
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    escapeJsString(str) {
        if (!str) return '';
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    }
}

const app = new App();
