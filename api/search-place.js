module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const query = String(req.query.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'query는 필수입니다.' });
  }

  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`;
  const naverRes = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_SEARCH_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_SEARCH_CLIENT_SECRET
    }
  });

  if (!naverRes.ok) {
    return res.status(502).json({ error: '네이버 검색에 실패했습니다.' });
  }

  const data = await naverRes.json();
  const stripTags = s => String(s || '').replace(/<[^>]+>/g, '');
  const items = (data.items || []).map(item => ({
    name: stripTags(item.title),
    category: item.category || '',
    address: item.address || '',
    roadAddress: item.roadAddress || ''
  }));

  return res.status(200).json(items);
};
