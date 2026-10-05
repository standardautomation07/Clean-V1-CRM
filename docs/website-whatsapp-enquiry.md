# Website product enquiry → WhatsApp → CRM

What to add to standardautomations.in so a product enquiry lands in the CRM.

## The flow

1. Visitor opens a product page and picks a quantity
2. They press **Enquire on WhatsApp**
3. WhatsApp opens with the message already written; they press send
4. The message arrives at **+91 93098 41322** and appears in NOVA → WhatsApp inbox as an **enquiry**
5. Someone presses **Convert to lead** — the model and quantity become the lead's requirement
6. From the lead, **New quotation** builds the quote

Nothing becomes a lead on its own, and nothing is sent to the customer without approval.

## Why the quantity is chosen on the website

A `wa.me` link can only pre-fill text. It cannot open a menu inside WhatsApp —
interactive menus have to be *sent by the business*, which Meta only permits
after the customer has already messaged. So the picker lives on the website,
where it is also faster for the customer: they tap a number and press send
once, rather than typing and waiting for a reply.

## The message format

```
Enquiry: SL1000AC
Quantity: 10 sets
```

The CRM reads the model against the 88-product catalogue and the quantity from
either line. It copes with people editing the text, typing their own wording,
or sending a bare model number; when it cannot read an enquiry it keeps the raw
message instead of guessing.

## The snippet

Put this on each product page, replacing `SL1000AC` with that product's model.

```html
<div class="wa-enquiry">
  <label for="wa-qty">Quantity</label>
  <select id="wa-qty">
    <option>1</option><option>2</option><option>5</option>
    <option>10</option><option>25</option><option>50</option><option>100</option>
  </select>
  <a id="wa-enquire" href="#" target="_blank" rel="noopener">Enquire on WhatsApp</a>
</div>

<script>
  (function () {
    var MODEL = 'SL1000AC';            // this product's model
    var NUMBER = '919309841322';        // Rollvento WhatsApp, no + or spaces
    var qty = document.getElementById('wa-qty');
    var link = document.getElementById('wa-enquire');
    function update() {
      var text = 'Enquiry: ' + MODEL + '\nQuantity: ' + qty.value + ' sets';
      link.href = 'https://wa.me/' + NUMBER + '?text=' + encodeURIComponent(text);
    }
    qty.addEventListener('change', update);
    update();
  })();
</script>
```

If your product pages are generated from a list, set `MODEL` from the same
field the page title uses rather than hard-coding it.

## Ready-made links

`docs/whatsapp-enquiry-links.json` holds a link for all 88 products, defaulted
to quantity 1. Useful for a catalogue page, a price list, or testing — but the
snippet above is better on a product page, because the customer sets quantity
before WhatsApp opens.

## Testing it

Open a product page on a phone, pick a quantity, press the button, send. The
enquiry should appear in NOVA → WhatsApp inbox within a few seconds, showing
the model and quantity, with **Convert to lead** beside it.
