## 原理

本脚本会自动获取目标网站的 `sitemap.xml` 文件，然后依次检测其中每一个页面的 HTML 代码是否包含预设的侵权词。  
将会自动跳过不包含sitemap.xml 或 sitemap_index.xml 或 wp-sitemap.xml网站的检测。  
在检测过程中，会自动跳过 `<a href="">` 链接标签内部的文本。

## 使用方法

1. **安装 Tampermonkey 插件**  
   在浏览器中打开以下链接，下载并安装 Tampermonkey（篡改猴）插件：  
   https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo  
   ![步骤1：安装Tampermonkey](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/0.jpg)

   <br>

3. **在扩展栏中将 Tampermonkey 钉住**  
   ![步骤2：锁定插件](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/1.jpg)

   <br>

5. **打开浏览器扩展管理页面**  
   ![步骤3：管理扩展](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/2.jpg)

   <br>

7. **启用开发者模式（⚠️ 非常重要）**  
   打开页面右上角的“开发者模式”开关：  
   ![步骤4：开启开发者模式](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/3.jpg)

   <br>

9. **下载脚本文件到本地**  
   点击下载“自动批量检测网站是否包含侵权词”脚本：  
   https://github.com/getanyapp/check-website-for-infringement/blob/main/%E8%87%AA%E5%8A%A8%E6%89%B9%E9%87%8F%E6%A3%80%E6%B5%8B%E7%BD%91%E7%AB%99%E6%98%AF%E5%90%A6%E5%8C%85%E5%90%AB%E4%BE%B5%E6%9D%83%E8%AF%8D.js  
   ![步骤5：下载脚本](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/10.jpg)

   <br>

11. **新建一个空脚本**  
   在 Tampermonkey 中点击“添加脚本”：  
   ![步骤6：新增脚本](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/4.jpg)

   <br>

13. **清空默认内容**  
   全选并删除编辑器内的默认模板内容：  
   ![步骤7：删除默认内容](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/5.jpg)

   <br>

15. **拖入本地脚本文件并安装**  
   将第 5 步下载的 `.js` 文件拖拽到编辑区域，会弹出安装提示，点击 **Install**：  
   ![步骤8：安装脚本](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/6.jpg)

   <br>

17. **进入脚本编辑界面**  
   点击 Tampermonkey 图标，再点击刚才安装的脚本进行编辑：  
   ![步骤9：编辑脚本](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/7.jpg)

   <br>

19. **按照脚本内的 `@description` 注释步骤依次配置**  
    脚本内含详细的配置说明，按注释一步步操作即可：  
    ![步骤10：查看说明](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/8.jpg)

    <br>

## 最终运行效果示例
    1. 打开任意页面（此处以 `www.baidu.com` 为例），脚本界面如下：  
       ![步骤11-1：脚本面板](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/9.jpg)  
      <br>
       
    2. 点击“开始检测”按钮，首次会弹出域名授权请求，选择“Always allow domain”：  
       ![步骤11-2：授权域名](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/9.0.jpg)  
      <br>
       
    3. 脚本自动运行，完成后会自动下载一份 Excel 报告：  
       ![步骤11-3：下载报告](https://raw.githubusercontent.com/getanyapp/check-website-for-infringement/main/image/9.1.jpg)
