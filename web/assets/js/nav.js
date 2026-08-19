let hasNavigatedInApp = false;

export const markNavigated = () => {
  hasNavigatedInApp = true;
};

export const canGoBack = () => hasNavigatedInApp;

export const goBack = () => {
  if (hasNavigatedInApp) window.history.back();
  else window.location.hash = '#/';
};
