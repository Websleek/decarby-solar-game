import { PROMOTIONAL_TERMS_VERSION } from '../../shared/rewards/consent'
import { resolvePromotionalTerms } from '../../shared/rewards/promotionalTerms'

export function VoucherTermsApp() {
  const terms = resolvePromotionalTerms(PROMOTIONAL_TERMS_VERSION)
  if (!terms) {
    return (
      <main className="voucher-terms">
        <p className="voucher-terms__brand">
          <span>Decarby</span> Solar
        </p>
        <h1>Voucher terms unavailable</h1>
        <p>Please return to the Roof Challenge and try again later.</p>
      </main>
    )
  }

  const { body, customerLabel } = terms

  return (
    <main className="voucher-terms">
      <p className="voucher-terms__brand">
        <span>Decarby</span> Solar
      </p>
      <h1>{customerLabel}</h1>
      <p className="voucher-terms__promoter">
        <strong>Promoter:</strong> {body.promoter}
      </p>

      <section className="voucher-terms__section" aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <p>{body.howItWorks}</p>
        <div className="voucher-terms__table-wrap">
          <table className="voucher-terms__table">
            <thead>
              <tr>
                <th scope="col">Total stars</th>
                <th scope="col">Voucher reward</th>
              </tr>
            </thead>
            <tbody>
              {body.rewardRows.map((row) => (
                <tr key={row.starsLabel}>
                  <td>{row.starsLabel}</td>
                  <td>{row.rewardLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="voucher-terms__section" aria-labelledby="conditions">
        <h2 id="conditions">Voucher conditions</h2>
        <ol className="voucher-terms__list">
          {body.conditions.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ol>
      </section>

      <p className="voucher-terms__contact">
        For voucher enquiries, contact{' '}
        <a href={`mailto:${body.enquiryEmail}`}>{body.enquiryEmail}</a>.
      </p>

      <p className="voucher-terms__back">
        <a href="/">Back to the Roof Challenge</a>
      </p>
    </main>
  )
}
