export {};

declare global {
  interface Window {
    /** m3e snackbar 注册在 window 上的全局服务 */
    M3eSnackbar: {
      open(message: string, arg2?: string | boolean, arg3?: unknown): void;
    };
  }
}
