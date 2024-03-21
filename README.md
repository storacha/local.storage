# local.storage

Run web3.storage locally!

## Usage

Install Node.js v20.11+ from [nodejs.org](https://nodejs.org).

Clone repo and install dependencies:

```sh
git clone https://github.com/w3s-project/local.storage.git
cd local.storage
npm install
```

Copy `.env.template` to `.env` and set environment variables:

```sh
### required

# multibase base64pad encoded ed25519 private key
# (you can use `w3 key create` to generate, see https://web3.storage/docs/w3cli/)
PRIVATE_KEY='Mg...'

### optional

# directory where to read/write data to
DATA_DIR=./data
# port the UCAN API should bind to
API_PORT=3000
# Public URL where UCAN invocations can be sent
PUBLIC_API_URL='http://localhost:3000'
# port the data ingest service should bind to
UPLOAD_PORT=3001
# Public URL where uploads will be received
PUBLIC_UPLOAD_URL='http://localhost:3001'
```

Start the service:

```sh
npm start
```

To use with [w3cli](https://web3.storage/docs/w3cli/), you'll need to set the following environment variables:

```sh
W3UP_SERVICE_URL=http://localhost:3000
W3UP_SERVICE_DID=did:web:XXX.local.web3.storage
# (replace XXX with your service DID, printed when the service starts)
W3_STORE_NAME=w3cli-local.storage
```
## Contributing

All welcome! web3.storage is open-source.

## License

Dual-licensed under [MIT + Apache 2.0](LICENSE.md)
