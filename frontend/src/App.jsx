import { useEffect, useState } from 'react'
import './App.css'
import { api } from './services/api'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'Not available'
  }

  return currencyFormatter.format(Number(value))
}

function formatStock(value, status) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    if (status === 'sold_out') return 'Sold out'
    if (status === 'unknown' || !status) return 'Unknown'
    return 'Not available'
  }

  if (Number(value) === 0) return 'Sold out'
  return `${Number(value)} remaining`
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function App() {
  const [health, setHealth] = useState({ status: 'loading', message: 'Checking backend connection...' })
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedOption, setSelectedOption] = useState('')
  const [trackStatus, setTrackStatus] = useState({ type: '', message: '' })
  const [trackedProducts, setTrackedProducts] = useState([])
  const [trackedLoading, setTrackedLoading] = useState(false)
  const [trackedError, setTrackedError] = useState('')
  const [historyById, setHistoryById] = useState({})
  const [logsById, setLogsById] = useState({})
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [activeLogsId, setActiveLogsId] = useState(null)
  const [historyLoadingId, setHistoryLoadingId] = useState(null)
  const [logsLoadingId, setLogsLoadingId] = useState(null)
  const [scrapingIds, setScrapingIds] = useState({})
  const [actionNote, setActionNote] = useState({ type: '', message: '' })

  async function fetchHealth() {
    try {
      const result = await api.getHealth()
      setHealth({ status: 'ok', message: result?.status === 'ok' ? 'Backend connected' : 'Backend connected' })
    } catch (error) {
      setHealth({ status: 'error', message: 'Backend unavailable' })
    }
  }

  async function fetchTrackedProducts() {
    setTrackedLoading(true)
    setTrackedError('')

    try {
      const response = await api.listTrackedProducts()
      setTrackedProducts(response?.trackedProducts || [])
    } catch (error) {
      setTrackedError(error.message || 'Unable to load data. Please try again.')
    } finally {
      setTrackedLoading(false)
    }
  }

  async function fetchHistory(trackedProductId) {
    if (activeHistoryId === trackedProductId && historyById[trackedProductId]) {
      setActiveHistoryId(null)
      return
    }

    setHistoryLoadingId(trackedProductId)

    try {
      const response = await api.getTrackedProductHistory(trackedProductId)
      setHistoryById((previous) => ({
        ...previous,
        [trackedProductId]: response?.history || [],
      }))
      setActiveHistoryId(trackedProductId)
    } catch (error) {
      setActionNote({
        type: 'error',
        message: error.message || 'Unable to load history.',
      })
    } finally {
      setHistoryLoadingId(null)
    }
  }

  async function fetchLogs(trackedProductId) {
    if (activeLogsId === trackedProductId && logsById[trackedProductId]) {
      setActiveLogsId(null)
      return
    }

    setLogsLoadingId(trackedProductId)

    try {
      const response = await api.getTrackedProductLogs(trackedProductId)
      setLogsById((previous) => ({
        ...previous,
        [trackedProductId]: response?.logs || [],
      }))
      setActiveLogsId(trackedProductId)
    } catch (error) {
      setActionNote({
        type: 'error',
        message: error.message || 'Unable to load logs.',
      })
    } finally {
      setLogsLoadingId(null)
    }
  }

  useEffect(() => {
    fetchHealth()
    fetchTrackedProducts()
  }, [])

  useEffect(() => {
    const trimmed = searchTerm.trim()

    if (!trimmed) {
      setSearchResults([])
      setSearchError('')
      return undefined
    }

    let isMounted = true
    const timeout = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')

      try {
        const response = await api.searchProducts(trimmed)
        if (!isMounted) return
        setSearchResults(response?.results || [])
      } catch (error) {
        if (!isMounted) return
        setSearchError(error.message || 'Unable to load data. Please try again.')
        setSearchResults([])
      } finally {
        if (isMounted) {
          setSearchLoading(false)
        }
      }
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timeout)
    }
  }, [searchTerm])

  async function handleSelectProduct(product) {
    setTrackStatus({ type: '', message: '' })

    try {
      const response = await api.getProductDetails(product.id)
      const productDetails = response?.product
      setSelectedProduct(productDetails)
      const firstOption = productDetails?.options?.[0]
      setSelectedOption(firstOption ? String(firstOption.label || firstOption.name || firstOption.value || '') : '')
    } catch (error) {
      setTrackStatus({
        type: 'error',
        message: error.message || 'Unable to load product details.',
      })
    }
  }

  async function handleTrackProduct() {
    if (!selectedProduct) {
      setTrackStatus({ type: 'error', message: 'Please select a product first.' })
      return
    }

    if (!selectedOption) {
      setTrackStatus({ type: 'error', message: 'Please choose an option before tracking.' })
      return
    }

    setTrackStatus({ type: 'pending', message: 'Tracking product...' })

    try {
      await api.createTrackedProduct({
        storeProductId: String(selectedProduct.id),
        optionName: selectedProduct.optionAxis || 'Option',
        selectedOption: String(selectedOption),
      })

      setTrackStatus({ type: 'success', message: 'Product tracked successfully.' })
      setSelectedProduct(null)
      setSelectedOption('')
      setSearchTerm('')
      await fetchTrackedProducts()
    } catch (error) {
      setTrackStatus({
        type: 'error',
        message: error.message || 'Unable to track the selected product.',
      })
    }
  }

  async function handleScrape(trackedProductId) {
    setScrapingIds((previous) => ({ ...previous, [trackedProductId]: true }))
    setActionNote({ type: '', message: '' })

    try {
      const response = await api.scrapeTrackedProduct(trackedProductId)

      if (!response?.success) {
        throw new Error(response?.error || 'Scrape failed. Check logs for details.')
      }

      setActionNote({ type: 'success', message: 'Scrape completed successfully.' })
      await fetchTrackedProducts()
      if (activeHistoryId === trackedProductId) await fetchHistory(trackedProductId)
      if (activeLogsId === trackedProductId) await fetchLogs(trackedProductId)
    } catch (error) {
      setActionNote({
        type: 'error',
        message: error.message || 'Scrape failed. Check logs for details.',
      })
    } finally {
      setScrapingIds((previous) => ({ ...previous, [trackedProductId]: false }))
    }
  }

  async function handleDelete(trackedProductId) {
    const confirmed = window.confirm('Stop tracking this product?')
    if (!confirmed) return

    try {
      await api.deleteTrackedProduct(trackedProductId)
      setActionNote({ type: 'success', message: 'Tracking removed.' })
      await fetchTrackedProducts()
      if (activeHistoryId === trackedProductId) setActiveHistoryId(null)
      if (activeLogsId === trackedProductId) setActiveLogsId(null)
    } catch (error) {
      setActionNote({
        type: 'error',
        message: error.message || 'Unable to stop tracking this product.',
      })
    }
  }

  async function handleExportCsv(trackedProductId) {
    try {
      const blob = await api.downloadTrackedCsv(trackedProductId)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tracked-product-${trackedProductId}-history.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setActionNote({ type: 'success', message: 'CSV export started.' })
    } catch (error) {
      setActionNote({
        type: 'error',
        message: error.message || 'Unable to export CSV.',
      })
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Product Price Tracker</h1>
          <p className="subtitle">Track product prices and stock from the INE mock store.</p>
        </div>

        <div className={`health-pill ${health.status}`}>
          <span className="status-dot" aria-hidden="true" />
          {health.message}
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="panel search-panel">
          <div className="panel-header">
            <h2>Search products</h2>
          </div>

          <div className="search-row">
            <input
              type="search"
              value={searchTerm}
              placeholder="Search product name..."
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search products"
            />
            <button type="button" className="primary-button" disabled={searchLoading || !searchTerm.trim()}>
              {searchLoading ? 'Loading...' : 'Search'}
            </button>
          </div>

          {searchError ? <p className="notice error">{searchError}</p> : null}

          <div className="results-list">
            {searchLoading && !searchResults.length ? <p className="notice info">Loading...</p> : null}

            {!searchLoading && !searchError && searchTerm.trim() && !searchResults.length ? (
              <p className="notice empty">No products found.</p>
            ) : null}

            {searchResults.map((product, index) => (
              <article key={`${product.id}-${index}`} className="result-card">
                <div>
                  <h3>{product.productName}</h3>
                  <p>Product ID: {product.id}</p>
                  <p>SKU: {product.sku || 'N/A'}</p>
                  <p>{product.options?.length || 0} available options</p>
                </div>

                <button type="button" className="secondary-button" onClick={() => handleSelectProduct(product)}>
                  Track product
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="panel detail-panel">
          <div className="panel-header">
            <h2>Product selection</h2>
          </div>

          {!selectedProduct ? (
            <p className="notice empty">Select a product to view details and available options.</p>
          ) : (
            <>
              <div className="product-meta">
                <h3>{selectedProduct.productName}</h3>
                <p>SKU: {selectedProduct.sku || 'N/A'}</p>
                <p>Product ID: {selectedProduct.id}</p>
              </div>

              <div className="option-group">
                <p className="option-label">{selectedProduct.optionAxis || 'Option'}</p>
                {selectedProduct.options?.length ? (
                  selectedProduct.options.map((option) => {
                    const optionLabel = option.label || option.name || option.value || 'Option'

                    return (
                      <label key={`${selectedProduct.id}-${optionLabel}`} className="option-row">
                        <input
                          type="radio"
                          name="selected-product-option"
                          checked={selectedOption === optionLabel}
                          onChange={() => setSelectedOption(optionLabel)}
                        />
                        <span>{optionLabel}</span>
                      </label>
                    )
                  })
                ) : (
                  <p className="notice empty">No options available.</p>
                )}
              </div>

              <button
                type="button"
                className="primary-button full-width"
                onClick={handleTrackProduct}
                disabled={trackStatus.type === 'pending'}
              >
                {trackStatus.type === 'pending' ? 'Tracking...' : 'Track product'}
              </button>
            </>
          )}

          {trackStatus.message ? (
            <p className={`notice ${trackStatus.type === 'error' ? 'error' : trackStatus.type === 'success' ? 'success' : 'info'}`}>
              {trackStatus.type === 'error'
                ? 'Unable to track product. Please try again.'
                : trackStatus.message}
            </p>
          ) : null}
        </div>

        <div className="panel tracked-panel">
          <div className="panel-header">
            <h2>Tracked products</h2>
          </div>

          {trackedLoading ? <p className="notice info">Loading...</p> : null}
          {trackedError ? <p className="notice error">{trackedError}</p> : null}

          {!trackedLoading && !trackedError && !trackedProducts.length ? (
            <p className="notice empty">No tracked products yet.</p>
          ) : null}

          <div className="tracked-list">
            {trackedProducts.map((product) => {
              const historyRows = historyById[product.id] || []
              const logsRows = logsById[product.id] || []
              const isScraping = Boolean(scrapingIds[product.id])

              return (
                <article key={product.id} className="tracked-card">
                  <div className="tracked-topline">
                    <div>
                      <h3>{product.productName}</h3>
                      <p>
                        Product ID: {product.storeProductId} · Option: {product.selectedOption}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDelete(product.id)}
                    >
                      Stop tracking
                    </button>
                  </div>

                  <div className="metrics-grid">
                    <div>
                      <span>Latest price</span>
                      <strong>{formatPrice(product.latestPrice)}</strong>
                    </div>
                    <div>
                      <span>Latest stock</span>
                      <strong>{formatStock(product.latestStock, product.latestStockStatus)}</strong>
                    </div>
                    <div>
                      <span>Stock status</span>
                      <strong>{formatStatusLabel(product.latestStockStatus)}</strong>
                    </div>
                    <div>
                      <span>Last scrape</span>
                      <strong>{product.latestTimestamp ? new Date(product.latestTimestamp).toLocaleString() : 'Not scraped yet'}</strong>
                    </div>
                    <div>
                      <span>Last outcome</span>
                      <strong>{product.latestOutcome ? product.latestOutcome : 'Not available'}</strong>
                    </div>
                  </div>

                  <div className="actions-row">
                    <button type="button" className="primary-button" onClick={() => handleScrape(product.id)} disabled={isScraping}>
                      {isScraping ? 'Scraping...' : 'Scrape Now'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => fetchHistory(product.id)}>
                      {historyLoadingId === product.id ? 'Loading...' : activeHistoryId === product.id ? 'Hide History' : 'View History'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => fetchLogs(product.id)}>
                      {logsLoadingId === product.id ? 'Loading...' : activeLogsId === product.id ? 'Hide Logs' : 'View Logs'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => handleExportCsv(product.id)}>
                      Export CSV
                    </button>
                  </div>

                  {actionNote.message ? (
                    <p className={`notice ${actionNote.type === 'error' ? 'error' : actionNote.type === 'success' ? 'success' : 'info'}`}>
                      {actionNote.message}
                    </p>
                  ) : null}

                  {activeHistoryId === product.id ? (
                    <div className="table-wrap">
                      <h4>History</h4>
                      {historyRows.length ? (
                        <table>
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Price</th>
                              <th>Stock</th>
                              <th>Stock status</th>
                              <th>Outcome</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyRows.map((entry, index) => (
                              <tr key={`${product.id}-history-${index}`}>
                                <td>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}</td>
                                <td>{entry.outcome === 'failed' ? '—' : formatPrice(entry.price)}</td>
                                <td>{entry.outcome === 'failed' ? '—' : formatStock(entry.stock, entry.stockStatus)}</td>
                                <td>{formatStatusLabel(entry.stockStatus)}</td>
                                <td>{entry.outcome}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="notice empty">No history available.</p>
                      )}
                    </div>
                  ) : null}

                  {activeLogsId === product.id ? (
                    <div className="table-wrap log-table">
                      <h4>Scrape logs</h4>
                      {logsRows.length ? (
                        <table>
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Attempt</th>
                              <th>Outcome</th>
                              <th>Price</th>
                              <th>Stock</th>
                              <th>Error</th>
                              <th>Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logsRows.map((log, index) => (
                              <tr key={`${product.id}-log-${index}`} className={`outcome-${log.outcome}`}>
                                <td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}</td>
                                <td>{log.attemptNumber}</td>
                                <td>{log.outcome}</td>
                                <td>{log.outcome === 'failed' ? '—' : formatPrice(log.price)}</td>
                                <td>{log.outcome === 'failed' ? '—' : formatStock(log.stock, log.stockStatus)}</td>
                                <td>{log.errorMessage || '—'}</td>
                                <td>{log.durationMs !== null && log.durationMs !== undefined ? `${log.durationMs} ms` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="notice empty">No logs available.</p>
                      )}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
