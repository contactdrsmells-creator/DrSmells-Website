import { Leaf, Heart, FlaskConical, Award, Users } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-pantone py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-olive mb-4">Our Story</h1>
          <p className="text-lg text-olive/60 max-w-2xl mx-auto">
            Born from a mission to revolutionize personal care with science-backed,
            natural solutions that truly work.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-olive mb-6">
            Your skin, our mission - smell like you
          </h2>
          <p className="text-olive/70 leading-relaxed mb-6">
            At Dr.Smells, we believe everyone deserves to feel confident in
            their own skin. Founded in Malaysia, our journey began when we
            realized that most deodorants on the market only mask odors
            temporarily, often with harsh chemicals that irritate sensitive
            skin.
          </p>
          <p className="text-olive/70 leading-relaxed mb-6">
            We set out to create something different - products that work{" "}
            <strong className="text-olive">with</strong> your body, not against it. Our formulations
            rejuvenate skin cells, repair damaged tissue, and eliminate
            odor-causing bacteria at the source, providing protection that
            lasts up to 100 hours.
          </p>
          <p className="text-olive/70 leading-relaxed">
            Every product is dermatologically tested, cruelty-free, and made
            with natural, vegan-friendly ingredients. We are proud to be a
            Malaysian brand making a global impact.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-olive mb-12">
            What We Stand For
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: FlaskConical,
                title: "Science-Backed",
                desc: "Every product is formulated using the latest dermatological research and undergoes rigorous clinical testing.",
              },
              {
                icon: Leaf,
                title: "Natural & Ethical",
                desc: "We use only natural ingredients and are committed to cruelty-free, vegan-friendly production methods.",
              },
              {
                icon: Heart,
                title: "Malaysian Pride",
                desc: "Proudly crafted in Malaysia with world-class quality standards and local expertise.",
              },
            ].map((v) => (
              <div key={v.title} className="bg-white/50 p-8 rounded-2xl text-center">
                <v.icon className="w-10 h-10 mx-auto text-olive mb-4" />
                <h3 className="text-lg font-semibold text-olive mb-2">
                  {v.title}
                </h3>
                <p className="text-sm text-olive/60">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clinical Studies */}
      <section id="clinical" className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Award className="w-12 h-12 mx-auto text-olive mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-olive mb-6">
            Clinical Studies
          </h2>
          <p className="text-olive/70 leading-relaxed mb-8">
            Our products undergo rigorous dermatological testing. Clinical
            studies confirm that our Anti-Odour Cream provides effective
            protection for up to 100 hours, while being gentle enough for daily
            use on all skin types including sensitive skin.
          </p>
          <div className="grid grid-cols-3 gap-6">
            {[
              { num: "100hrs", label: "Odour Protection" },
              { num: "98%", label: "Customer Satisfaction" },
              { num: "0%", label: "Harsh Chemicals" },
            ].map((stat) => (
              <div key={stat.label} className="p-4 bg-sage-light rounded-xl">
                <p className="text-2xl md:text-3xl font-bold text-olive">
                  {stat.num}
                </p>
                <p className="text-xs md:text-sm text-olive/60 mt-1">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Users className="w-12 h-12 mx-auto text-olive mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-olive mb-4">
            LIFE BIO LAB SDN. BHD
          </h2>
          <p className="text-olive/60">(1452572-P)</p>
          <p className="text-olive/70 mt-4 max-w-2xl mx-auto">
            A Malaysian biotech company dedicated to developing innovative
            personal care solutions that combine cutting-edge science with
            natural ingredients.
          </p>
        </div>
      </section>
    </div>
  );
}
