# WebGL水波特效

## 在线体验效果

https://kason.site/

## 使用方法

HTML

```html
<div class="img-wrapper">
</div>
```

JS

```javascript
const el = document.querySelector(".img-wrapper");
const img = new Image();
img.onload = () => {
  const ripples = new Ripples({
    el,
    resolution: 256,
    dropRadius: 15,
    perturbance: 0.05,
    interactive: true,
    image: img,
  });
}
img.src = "真实图片地址"
el.appendChild(img);
```