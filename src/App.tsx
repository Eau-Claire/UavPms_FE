import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { router } from '@router';
import { store } from '@store/store';
import { ANT_THEME_TOKEN } from '@styles/tokens';

function App() {
  return (
    <Provider store={store}>
      <ConfigProvider locale={viVN} theme={{ token: ANT_THEME_TOKEN }}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </Provider>
  );
}

export default App;
