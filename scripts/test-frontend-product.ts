import axios from 'axios';

async function testFrontend() {
  console.log('Testing frontend PDP for Samsung Galaxy A07...');
  const res = await axios.get('http://localhost:3000/products/samsung-samsung-galaxy-a07-dual-sim-with-official-warranty', {
    timeout: 10000,
  });
  console.log('HTTP Status:', res.status);
  const html = res.data;
  console.log('Includes PriceOye?', html.includes('PriceOye'));
  console.log('Includes Telemart?', html.includes('Telemart'));
  console.log('Includes 35,795?', html.includes('35,795') || html.includes('35795'));
  console.log('Includes 36,799?', html.includes('36,799') || html.includes('36799'));
}

testFrontend().catch(console.error);
