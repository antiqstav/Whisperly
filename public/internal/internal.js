const fontControl = document.getElementByClass('font-control')[0];

fontControl.addEventListener('change', (event) => {
    document.documentElement.style.setProperty('--app-font', event.target.value);
});