// City-level travel map. Countries remain neutral; only visited cities light up.
(function () {
  "use strict";
  var MAP = document.getElementById("travel-map-container");
  if (!MAP) return;
  var BASE = document.body.dataset.baseurl || "";
  var mode = "domestic", region = "europe", cityData = [], worldData = null, tooltip;
  function el(name, className) { var node=document.createElement(name); if(className)node.className=className; return node; }
  function boundsFor(view) {
    if (view === "domestic") return {minLon:72,maxLon:136,minLat:17,maxLat:55};
    if (view === "international" && region === "europe") return {minLon:-12,maxLon:20,minLat:35,maxLat:60};
    if (view === "international" && region === "asia") return {minLon:95,maxLon:140,minLat:5,maxLat:42};
    if (view === "international" && region === "americas") return {minLon:-130,maxLon:-65,minLat:20,maxLat:50};
    return {minLon:-180,maxLon:180,minLat:-58,maxLat:84};
  }
  function visibleCity(city, view) { return view==="domestic"?city.domestic:view==="international"?!city.domestic&&(region==="all"||city.region===region):true; }
  function showTooltip(city,event) { if(!tooltip){tooltip=el("div","city-map-tooltip");document.body.appendChild(tooltip);} tooltip.innerHTML="<strong>"+city.name+"</strong><span>"+city.country+"</span>";tooltip.hidden=false;moveTooltip(event); }
  function moveTooltip(event) { if(!tooltip||tooltip.hidden)return;tooltip.style.left=Math.max(12,Math.min(innerWidth-tooltip.offsetWidth-12,event.clientX+14))+"px";tooltip.style.top=Math.max(12,Math.min(innerHeight-tooltip.offsetHeight-12,event.clientY+14))+"px"; }
  function hideTooltip(){if(tooltip)tooltip.hidden=true;}
  function searchCity(city){hideTooltip();var input=window.TravelsNS&&window.TravelsNS.INPUT_EL;if(!input)return;input.value=city.search||city.name.split(" ")[0];window.TravelsNS.applyFilter();document.querySelector(".travel-toolbar")?.scrollIntoView({behavior:"smooth",block:"start"});}
  function pathForRing(ring,project){if(!ring||!ring.length)return"";var out="",step=Math.max(1,Math.floor(ring.length/800));for(var i=0;i<ring.length;i+=step){var p=project(ring[i][0],ring[i][1]);out+=(out?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1);}return out+"Z";}
  function geometryPath(geometry,project){if(!geometry)return"";if(geometry.type==="Polygon")return geometry.coordinates.map(function(r){return pathForRing(r,project);}).join(" ");if(geometry.type==="MultiPolygon")return geometry.coordinates.map(function(p){return p.map(function(r){return pathForRing(r,project);}).join(" ");}).join(" ");return"";}
  function render(){
    hideTooltip();
    var view=mode,box=boundsFor(view),width=1000,height=view==="international"&&region!=="all"?650:view==="domestic"?570:470;
    function project(lon,lat){return[(lon-box.minLon)/(box.maxLon-box.minLon)*width,(box.maxLat-lat)/(box.maxLat-box.minLat)*height];}
    MAP.innerHTML="";
    var head=el("div","city-map-head"),title=el("div","city-map-head__copy");title.innerHTML="<span>TRAVEL ATLAS</span><strong>去过的地方</strong><small>国家保持留白，点亮到访地点；放大后可拖动地图</small>";
    var tabs=el("div","city-map-tabs");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","地图范围");
    [["domestic","境内"],["international","境外"],["all","全部"]].forEach(function(item){var button=el("button","city-map-tab"+(view===item[0]?" is-active":""));button.type="button";button.textContent=item[1];button.dataset.mapMode=item[0];button.setAttribute("role","tab");button.setAttribute("aria-selected",String(view===item[0]));button.addEventListener("click",function(){mode=item[0];render();});tabs.appendChild(button);});
    head.appendChild(title);head.appendChild(tabs);MAP.appendChild(head);
    if(view==="international"){
      var regionTabs=el("div","city-map-region-tabs");regionTabs.setAttribute("role","tablist");regionTabs.setAttribute("aria-label","境外地区");
      [["europe","欧洲"],["asia","亚洲"],["americas","美洲"],["all","全部"]].forEach(function(item){var button=el("button","city-map-region-tab"+(region===item[0]?" is-active":""));button.type="button";button.textContent=item[1];button.setAttribute("role","tab");button.setAttribute("aria-selected",String(region===item[0]));button.addEventListener("click",function(){region=item[0];render();});regionTabs.appendChild(button);});
      MAP.appendChild(regionTabs);
    }
    var viewport=el("div","city-map-viewport"),svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 "+width+" "+height);svg.setAttribute("role","img");svg.setAttribute("aria-label",view==="domestic"?"中国城市足迹地图":view==="international"?"境外城市足迹地图":"全部城市足迹地图");
    var zoom=1,viewX=0,viewY=0,viewWidth=width,viewHeight=height,dragging=false,lastPointerX=0,lastPointerY=0,zoomControls=el("div","city-map-zoom"),zoomOut=el("button"),zoomReset=el("button","city-map-zoom__reset"),zoomIn=el("button");
    function clampView(){viewX=Math.max(0,Math.min(width-viewWidth,viewX));viewY=Math.max(0,Math.min(height-viewHeight,viewY));}
    function updateViewBox(){clampView();svg.setAttribute("viewBox",viewX+" "+viewY+" "+viewWidth+" "+viewHeight);}
    function setZoom(next){var centerX=viewX+viewWidth/2,centerY=viewY+viewHeight/2;zoom=Math.max(1,Math.min(3,next));viewWidth=width/zoom;viewHeight=height/zoom;viewX=centerX-viewWidth/2;viewY=centerY-viewHeight/2;updateViewBox();svg.classList.toggle("is-zoomed",zoom>1);zoomOut.disabled=zoom===1;zoomIn.disabled=zoom===3;zoomReset.textContent=zoom+"×";hideTooltip();}
    [[zoomOut,"−","缩小地图"],[zoomReset,"1×","恢复原始大小"],[zoomIn,"＋","放大地图"]].forEach(function(item){item[0].type="button";item[0].textContent=item[1];item[0].setAttribute("aria-label",item[2]);zoomControls.appendChild(item[0]);});
    zoomOut.addEventListener("click",function(){setZoom(zoom-.5);});zoomReset.addEventListener("click",function(){setZoom(1);});zoomIn.addEventListener("click",function(){setZoom(zoom+.5);});setZoom(1);
    svg.addEventListener("pointerdown",function(event){if(zoom===1||event.button!==0||event.target.closest(".city-map-pin"))return;dragging=true;lastPointerX=event.clientX;lastPointerY=event.clientY;svg.setPointerCapture(event.pointerId);svg.classList.add("is-dragging");hideTooltip();});
    svg.addEventListener("pointermove",function(event){if(!dragging)return;var rect=svg.getBoundingClientRect();viewX-=(event.clientX-lastPointerX)*viewWidth/rect.width;viewY-=(event.clientY-lastPointerY)*viewHeight/rect.height;lastPointerX=event.clientX;lastPointerY=event.clientY;updateViewBox();event.preventDefault();});
    function stopDragging(event){if(!dragging)return;dragging=false;svg.classList.remove("is-dragging");if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}
    svg.addEventListener("pointerup",stopDragging);svg.addEventListener("pointercancel",stopDragging);
    var mapGroup=document.createElementNS(svg.namespaceURI,"g");mapGroup.setAttribute("class","city-map-land");worldData.features.forEach(function(feature){var p=document.createElementNS(svg.namespaceURI,"path");p.setAttribute("d",geometryPath(feature.geometry,project));mapGroup.appendChild(p);});svg.appendChild(mapGroup);
    var shown=cityData.filter(function(c){return visibleCity(c,view);});
    shown.forEach(function(city){var point=project(city.lon,city.lat);if(point[0]<0||point[0]>width||point[1]<0||point[1]>height)return;var group=document.createElementNS(svg.namespaceURI,"g");group.setAttribute("class","city-map-pin");group.setAttribute("tabindex","0");group.setAttribute("role","button");group.setAttribute("aria-label",city.name+"，"+city.country+"，查看旅行笔记");var halo=document.createElementNS(svg.namespaceURI,"circle");halo.setAttribute("class","city-map-pin__halo");halo.setAttribute("cx",point[0]);halo.setAttribute("cy",point[1]);halo.setAttribute("r","24");var dot=document.createElementNS(svg.namespaceURI,"circle");dot.setAttribute("class","city-map-pin__dot");dot.setAttribute("cx",point[0]);dot.setAttribute("cy",point[1]);dot.setAttribute("r","9");var label=document.createElementNS(svg.namespaceURI,"text");var dx=city.labelDx||14;label.setAttribute("x",point[0]+dx);label.setAttribute("y",point[1]+(city.labelDy||-14));if(dx<0)label.setAttribute("text-anchor","end");label.textContent=view==="all"||(view==="international"&&region==="all")?"":city.name.split(" ")[0];group.appendChild(halo);group.appendChild(dot);group.appendChild(label);group.addEventListener("mouseenter",function(e){showTooltip(city,e);});group.addEventListener("mousemove",moveTooltip);group.addEventListener("mouseleave",hideTooltip);group.addEventListener("click",function(){searchCity(city);});group.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();searchCity(city);}});svg.appendChild(group);});
    viewport.appendChild(svg);viewport.appendChild(zoomControls);MAP.appendChild(viewport);var legend=el("div","city-map-legend");legend.innerHTML="<span><i></i>去过的地点</span><span>当前显示 <strong>"+shown.length+"</strong> 个地点</span>";MAP.appendChild(legend);document.getElementById("travel-page-loading")?.remove();
  }
  window.addEventListener("scroll",hideTooltip,{passive:true});
  Promise.all([fetch(BASE+"/assets/data/world.geojson").then(function(r){if(!r.ok)throw Error();return r.json();}),fetch(BASE+"/assets/data/travel-cities.json?v=5").then(function(r){if(!r.ok)throw Error();return r.json();})]).then(function(data){worldData=data[0];cityData=data[1];render();}).catch(function(){MAP.innerHTML='<p class="city-map-error">地图暂时没有加载出来，请刷新后重试。</p>';document.getElementById("travel-page-loading")?.remove();});
})();
