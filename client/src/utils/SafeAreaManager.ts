/**
 * Safe Area Manager
 * Reads and provides safe area insets for notches, home bars, etc.
 */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export class SafeAreaManager {
  private static insets: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private static listeners: Array<(insets: SafeAreaInsets) => void> = [];

  public static init(): void {
    this.updateInsets();
    
    // Listen to visual viewport changes (mobile browser UI show/hide)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.updateInsets());
      window.visualViewport.addEventListener('scroll', () => this.updateInsets());
    }
    
    // Fallback for browsers without visualViewport
    window.addEventListener('resize', () => this.updateInsets());
    window.addEventListener('orientationchange', () => {
      // Delay to let browser settle after orientation change
      setTimeout(() => this.updateInsets(), 100);
    });
  }

  private static updateInsets(): void {
    const probe = document.getElementById('safe-area-probe');
    if (!probe) return;

    const computedStyle = window.getComputedStyle(probe);
    const newInsets: SafeAreaInsets = {
      top: parseFloat(computedStyle.top) || 0,
      right: parseFloat(computedStyle.right) || 0,
      bottom: parseFloat(computedStyle.bottom) || 0,
      left: parseFloat(computedStyle.left) || 0,
    };

    // Only notify if changed
    if (
      newInsets.top !== this.insets.top ||
      newInsets.right !== this.insets.right ||
      newInsets.bottom !== this.insets.bottom ||
      newInsets.left !== this.insets.left
    ) {
      this.insets = newInsets;
      this.notifyListeners();
    }
  }

  public static getInsets(): SafeAreaInsets {
    return { ...this.insets };
  }

  public static onInsetsChange(callback: (insets: SafeAreaInsets) => void): void {
    this.listeners.push(callback);
  }

  private static notifyListeners(): void {
    this.listeners.forEach((callback) => callback(this.getInsets()));
  }
}
