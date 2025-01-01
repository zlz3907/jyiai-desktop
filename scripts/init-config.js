// 添加构建配置
const buildForMAS = async () => {
  try {
    console.log('Building for Mac App Store...');
    // 构建前的清理工作
    await cleanup();
    
    // 执行构建
    const result = await build({
      target: 'mas',
      arch: ['x64', 'arm64'],
      config: {
        appId: 'your.app.id',
        productName: 'Your App Name'
      }
    });
    
    console.log('Build completed:', result);
  } catch (error) {
    console.error('Build failed:', error);
  }
};

// 导出构建函数
module.exports = {
  buildForMAS
}; 