const {test,expect}=require('./fixtures.cjs');
const screens=require('./screens.cjs');
for(const [id,url,title] of screens) {
  test(id+' direct navigation, session restore, reload and phone/tablet/desktop rendering '+url,async({audit,page},info)=>{
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
    if(url!='/login') await audit.session(page);
    const errors=[],httpErrors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)httpErrors.push({url:r.url(),status:r.status()});});
    page.on('requestfailed',r=>{if(r.url().includes('/api/'))httpErrors.push({url:r.url(),failure:r.failure()?.errorText});});
    await page.goto(url);await page.waitForLoadState('networkidle');
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
    if(url==='/') await expect(page.getByRole('button',{name:'Table 12',exact:true})).toBeVisible();
    if(url==='/employees') await expect(page.getByText('Audit Staff',{exact:true}).first()).toBeVisible();
    if(url==='/inventory') await expect(page.getByText('Audit Chicken',{exact:true}).first()).toBeVisible();
    await page.reload();await page.waitForLoadState('networkidle');
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
    for(const width of [375,768,1440]) {
      await page.setViewportSize({width,height:900});
      await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
      const dimensions=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
      audit.check('Viewport '+width,dimensions);
      expect.soft(dimensions.width,'Document overflow on '+url+' at '+width).toBeLessThanOrEqual(width+1);
    }
    audit.check('Browser errors',errors);audit.check('HTTP failures',httpErrors);
    expect(errors).toEqual([]);expect(httpErrors).toEqual([]);
    await info.attach('screen',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  });
}
