# Fixtures

Everything in this folder is **invented test data**. The articles, numbers and
quotes are not real and must never be used as facts. URLs use `example.org`,
except the open data APIs, whose real URLs are mapped to small invented samples
so the parsers can be tested offline.

`http/index.json` maps each URL to a file. With `DRY_RUN=1` the engine reads only
from here; a URL without a fixture returns 404, so a dry run never reaches the network.

Countries rotate across regions: Indonesia, Brazil, Mexico, Peru, Senegal,
Côte d'Ivoire, Viet Nam, Japan, Mozambique, Kenya, Colombia, South Africa, Poland, Türkiye.
