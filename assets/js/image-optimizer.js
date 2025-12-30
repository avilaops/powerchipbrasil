// Image Optimization Script - Powerchip Brasil
// Progressive image loading with Intersection Observer

(function() {
    'use strict';
    
    // Configuration
    const config = {
        rootMargin: '50px',
        threshold: 0.01,
        loadDelay: 100
    };

    // Lazy load images with Intersection Observer
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                
                // Add loading animation
                img.style.transition = 'opacity 0.3s ease-in-out';
                img.style.opacity = '0';
                
                // Load the image
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                
                // Fade in when loaded
                img.onload = () => {
                    setTimeout(() => {
                        img.style.opacity = '1';
                    }, config.loadDelay);
                };
                
                // Stop observing this image
                observer.unobserve(img);
            }
        });
    }, config);

    // Progressive image quality loading
    function loadProgressiveImage(img) {
        const lowQualitySrc = img.dataset.lowsrc;
        const highQualitySrc = img.dataset.src;
        
        if (lowQualitySrc) {
            // Load low quality first
            const lowImg = new Image();
            lowImg.src = lowQualitySrc;
            lowImg.onload = () => {
                img.src = lowQualitySrc;
                img.classList.add('loaded-low');
                
                // Then load high quality
                const highImg = new Image();
                highImg.src = highQualitySrc;
                highImg.onload = () => {
                    img.src = highQualitySrc;
                    img.classList.remove('loaded-low');
                    img.classList.add('loaded-high');
                };
            };
        }
    }

    // Preload critical images
    function preloadCriticalImages() {
        const criticalImages = document.querySelectorAll('img[data-critical="true"]');
        criticalImages.forEach(img => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = img.src || img.dataset.src;
            document.head.appendChild(link);
        });
    }

    // Compress images using canvas (client-side optimization)
    function compressImage(img, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                resolve(url);
            }, 'image/jpeg', quality);
        });
    }

    // Image format detection and optimization
    function supportsWebP() {
        const canvas = document.createElement('canvas');
        if (canvas.getContext && canvas.getContext('2d')) {
            return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        }
        return false;
    }

    // Add blur-up effect for loading images
    function addBlurUpEffect() {
        const style = document.createElement('style');
        style.textContent = `
            img[data-src] {
                filter: blur(10px);
                transition: filter 0.3s;
            }
            img.loaded-high {
                filter: blur(0);
            }
            img.loading-placeholder {
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: shimmer 1.5s infinite;
            }
            @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize on DOM ready
    function init() {
        // Add blur-up styles
        addBlurUpEffect();
        
        // Preload critical images
        preloadCriticalImages();
        
        // Observe all lazy-loadable images
        const lazyImages = document.querySelectorAll('img[loading="lazy"]');
        lazyImages.forEach(img => imageObserver.observe(img));
        
        // Check WebP support and update sources if needed
        if (supportsWebP()) {
            document.documentElement.classList.add('webp-support');
        }
        
        console.log('🚀 Image Optimizer loaded - Performance optimizations active');
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
