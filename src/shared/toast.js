/**
 * Shows a temporary notification (toast) message on the screen.
 * @param {string} title - The title text of the toast.
 * @param {string} message - The detailed message inside the toast.
 * @param {string} type - The type of toast: 'success' (default), 'error', or 'info'.
 */

// Production logging gate.
const DEBUG = false;

function showToast(title, message, type = 'success') {
    // Find the container where toasts will be shown
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        if (DEBUG) console.warn('Toast container element with id "toastContainer" not found.');
        return;  // If container is missing, stop the function
    }

    // Create a new div element for the toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`; // Add CSS classes based on toast type

    // Choose a simple icon glyph (no external dependencies)
    let icon = '✓';
    if (type === 'error') icon = '!';
    if (type === 'info') icon = 'i';

    // Set the inner HTML of the toast with icon, title, message, and close button
    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${icon}</span>
        <div class="toast-content">
            <div class="toast-title"></div>
            <div class="toast-message"></div>
        </div>
        <button class="toast-close" type="button" aria-label="Close">×</button>
    `;

    // Avoid injecting untrusted strings as HTML.
    toast.querySelector('.toast-title').textContent = String(title ?? '');
    toast.querySelector('.toast-message').textContent = String(message ?? '');

    // Add the toast element to the container so it becomes visible
    toastContainer.appendChild(toast);

    // Find the close button inside the toast
    const closeBtn = toast.querySelector('.toast-close');
    // When user clicks the close button, fade out and remove the toast
    closeBtn.addEventListener('click', () => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';  // start fade out animation
        setTimeout(() => {
            toastContainer.removeChild(toast);  // remove toast from DOM after animation
        }, 300); // wait for animation to finish before removing
    });

    // Automatically remove the toast after 3 seconds if not closed already
    setTimeout(() => {
        if (toast.parentNode === toastContainer) {  // check if toast is still visible
            toast.style.animation = 'fadeOut 0.3s ease forwards';  // fade out animation
            setTimeout(() => {
                if (toast.parentNode === toastContainer) {
                    toastContainer.removeChild(toast);  // remove after animation
                }
            }, 300);
        }
    }, 3000);
}

// expose globally for non-module scripts
window.showToast = showToast;
